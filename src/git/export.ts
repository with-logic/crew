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
 * normal success and failure share a cleanup scope; `exportTree` hands
 * the export to a caller that keeps it longer.
 */

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { removeEach, withLeftBehind } from "../util/cleanup.ts";
import { ensureDir } from "../util/fs.ts";
import { progress } from "../util/progress.ts";
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
  const indexFile = `${dest}.crew-export-index`;
  const pathspec = subpath.length > 0 ? subpath : ".";
  const args = [`--work-tree=${dest}`, "checkout", sha, "--", pathspec];
  try {
    runGit(args, { cwd: clonePath, env: { GIT_INDEX_FILE: indexFile } });
  } catch (err) {
    // `runGit` only throws `GitProcessError`. The failure stays the one
    // reported, naming the scratch index if crew couldn't remove it.
    const failure = exportFailure(err as GitProcessError, sha, subpath, pathspec, clonePath);
    throw withLeftBehind(failure, removeEach([indexFile]));
  }
  // An index crew can't remove is left beside the export, which stands.
  removeEach([indexFile]);
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

/** A scratch export of a commit: the source root inside it, and how to delete it. */
export interface ExportedTree {
  readonly location: string;
  /**
   * Delete the export. Never throws: one crew can't remove must not replace
   * its holder's result or error, so it is left — noted under `--verbose`,
   * naming it — for `crew cache clean`.
   */
  readonly remove: () => void;
}

/**
 * Export `sha` into a scratch directory the caller deletes with `remove`
 * — after one callback (`withExportedTree`), or after a whole resolution
 * that reads the same commit for many skills.
 *
 * `location` matches the source root: the export root when `subpath` is
 * empty, otherwise the subpath inside it — a directory, or the file itself
 * when the subpath names a gist skill file. It is checked for symlink
 * escapes first, because §9 step 3 requires every byte crew reads to come
 * from the requested commit: a repository can commit a symlink at the
 * subpath itself, and following it would read content from outside that
 * commit entirely. Each export sits directly under the git cache, which is
 * how discovery finds the repository a location below it must stay in
 * (`sourceBoundary`). A failed export leaves nothing behind, or names
 * what crew couldn't remove in its error, which stays the export's own.
 */
export function exportTree(
  clonePath: string,
  sha: string,
  subpath: string,
  home: string,
): ExportedTree {
  const dest = makeScratchDir(paths(home).gitCacheDir, sha);
  try {
    exportTreeAt(clonePath, sha, subpath, dest);
    const location = subpath.length > 0 ? join(dest, subpath) : dest;
    assertNoSymlinkEscape(dest, location, subpath);
    return { location, remove: () => removeScratch(dest) };
  } catch (err) {
    // The export's own failure stays the error; a folder left behind is named in it.
    throw withLeftBehind(err as Error, removeEach([dest]));
  }
}

/**
 * Run `fn` against a scratch export of `sha` (`exportTree`), then delete
 * it when `fn` returns or throws; an export crew can't delete is left,
 * never replacing `fn`'s result or error.
 */
export function withExportedTree<T>(
  clonePath: string,
  sha: string,
  subpath: string,
  home: string,
  fn: (location: string) => T,
): T {
  const tree = exportTree(clonePath, sha, subpath, home);
  try {
    return fn(tree.location);
  } finally {
    tree.remove();
  }
}

/** Remove the scratch export at `dest`; one crew can't remove is noted under `--verbose`. */
function removeScratch(dest: string): void {
  for (const left of removeEach([dest])) {
    progress(`left the scratch export ${left}; \`crew cache clean\` removes it`);
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
      "Check that `~/.crew/cache` is writable, or run `crew cache clean`.",
    );
  }
}
