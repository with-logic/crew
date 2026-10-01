/**
 * Materialize a repository tree at a specific commit (§9 step 3).
 *
 * When a reference carries an `@<ref>` tail, crew must read the skill
 * content as it existed at that commit — not whatever the shared clone's
 * working tree happens to hold. The clone is shared: `crew search`, tap
 * re-expansion, and every other consumer expect it parked at
 * `origin/HEAD`, so checking out the pinned SHA in place would corrupt
 * their view.
 *
 * `exportTreeAt` writes the requested tree into a scratch directory
 * under `~/.crew/cache/git/` using `git checkout` against a detached
 * `--work-tree` and a throwaway index. That reads straight from the
 * object database and leaves the clone's own working tree and index
 * untouched, so it is safe against a shared clone and behaves the same
 * on macOS and Linux. It also keeps crew's host requirements to the
 * `git` already mandated by §17.1 — an external archive extractor
 * would add an undeclared dependency.
 *
 * `withExportedTree` wraps the common "use it, then delete it" shape so
 * a thrown error can't leak a directory into the cache.
 */

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { ensureDir, rmrf } from "../util/fs.ts";
import { type GitProcessError, runGit } from "./exec.ts";
import { assertNoSymlinkEscape } from "./tree-safety.ts";

/**
 * Extract `sha`'s tree (optionally narrowed to `subpath`) from the clone
 * at `clonePath` into `dest`, which is created if missing.
 *
 * Two failure kinds, deliberately distinguished (§13):
 *
 *   - the commit resolved and the tree is readable, but `subpath` isn't
 *     present at it → `no_skills_found`, a user-fixable reference;
 *   - anything else — an unreadable object, a corrupt repository, a
 *     scratch directory crew can't write — → `source_unreachable`,
 *     because the source was never successfully materialized and
 *     nothing can be concluded about what it contains.
 *
 * Collapsing the second kind into the first would tell a user their ref
 * names a missing directory when the truth is that crew could not read
 * the repository at all.
 */
export function exportTreeAt(clonePath: string, sha: string, subpath: string, dest: string): void {
  ensureDir(dest);
  // A scratch index keeps the clone's real index untouched; without it
  // `git checkout` would stage the exported paths into the shared repo.
  const indexFile = join(dest, ".crew-export-index");
  const pathspec = subpath.length > 0 ? subpath : ".";
  const args = [`--work-tree=${dest}`, "checkout", sha, "--", pathspec];
  try {
    runGit(args, { cwd: clonePath, env: { GIT_INDEX_FILE: indexFile } });
  } catch (err) {
    // `runGit` only throws `GitProcessError`.
    const ge = err as GitProcessError;
    rmrf(indexFile);
    throw exportFailure(ge, sha, subpath, pathspec, clonePath);
  }
  rmrf(indexFile);
}

/**
 * Classify a failed export. `git checkout` reports a pathspec that
 * matched nothing distinctly from a failure to read or write, so the
 * two map to different §13 errors rather than one catch-all.
 */
function exportFailure(
  ge: GitProcessError,
  sha: string,
  subpath: string,
  pathspec: string,
  clonePath: string,
): CrewError {
  const stderr = ge.result.stderr.trim();
  if (/did not match any file/i.test(stderr)) {
    return new CrewError(
      "no_skills_found",
      `\`${pathspec}\` doesn't exist at ${sha.slice(0, 8)} — ${stderr}`,
      { sha, subpath },
    );
  }
  return new CrewError(
    "source_unreachable",
    `couldn't read ${sha.slice(0, 8)} from the clone at \`${clonePath}\` — ${stderr}`,
    { sha, subpath, clonePath },
  );
}

/**
 * Run `fn` against a scratch export of `sha`, then delete the scratch
 * directory — even when `fn` throws, so a failed install never leaves
 * bytes behind in the cache.
 *
 * `fn` receives the directory matching the source root: the export root
 * when `subpath` is empty, otherwise the subpath inside it. That root is
 * checked for symlink escapes first, because §9 step 3 requires every
 * byte crew reads to come from the requested commit: a repository can
 * commit a symlink at the subpath itself, and following it would read
 * content from outside that commit entirely.
 */
export function withExportedTree<T>(
  clonePath: string,
  sha: string,
  subpath: string,
  home: string,
  fn: (rootDir: string) => T,
): T {
  const dest = makeScratchDir(paths(home).gitCacheDir, sha);
  try {
    exportTreeAt(clonePath, sha, subpath, dest);
    const rootDir = subpath.length > 0 ? join(dest, subpath) : dest;
    assertNoSymlinkEscape(dest, rootDir, subpath);
    return fn(rootDir);
  } finally {
    // `rmrf` passes `force: true`, so a missing directory is not an
    // error. A genuine removal failure must NOT be raised from here: it
    // would replace `fn`'s own error (or its result) with a cleanup
    // complaint, which is strictly less useful to the caller. The
    // leftover directory is reclaimed by `crew cache clear` and by the
    // store GC that already runs after install and update.
    rmrf(dest);
  }
}

/**
 * Create the scratch directory for one export.
 *
 * An unwritable cache root — a read-only `~/.crew`, a `cache` path that
 * is a file, a full disk — surfaces here as a raw `node:fs` error. Left
 * untranslated it escapes the §13 error set and the CLI top-level
 * reports it as `usage_error` (exit 2), which tells the user their
 * command was malformed when in fact crew could not materialize the
 * source at all. That is exactly the `source_unreachable` case (§13).
 */
function makeScratchDir(cacheRoot: string, sha: string): string {
  try {
    ensureDir(cacheRoot);
    return mkdtempSync(join(cacheRoot, `${sha.slice(0, 8)}-`));
  } catch (err) {
    throw new CrewError(
      "source_unreachable",
      `couldn't create a scratch directory for ${sha.slice(0, 8)} under \`${cacheRoot}\` — ${(err as Error).message}`,
      { sha, cacheRoot },
      "Check that `~/.crew/cache` is writable, or run `crew cache clear`.",
    );
  }
}
