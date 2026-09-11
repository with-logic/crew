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
 * A `subpath` absent at that commit throws `no_skills_found`: the ref
 * resolved fine, the location inside it just isn't there.
 */
export function exportTreeAt(clonePath: string, sha: string, subpath: string, dest: string): void {
  ensureDir(dest);
  // A scratch index keeps the clone's real index untouched; without it
  // `git checkout` would stage the exported paths into the shared repo.
  const indexFile = join(dest, ".crew-export-index");
  const args = [`--work-tree=${dest}`, "checkout", sha, "--", subpath.length > 0 ? subpath : "."];
  try {
    runGit(args, { cwd: clonePath, env: { GIT_INDEX_FILE: indexFile } });
  } catch (err) {
    // `runGit` only throws `GitProcessError`; the common cause here is a
    // pathspec that doesn't exist at this commit.
    const ge = err as GitProcessError;
    rmrf(indexFile);
    throw new CrewError(
      "no_skills_found",
      `\`${subpath.length > 0 ? subpath : "."}\` doesn't exist at ${sha.slice(0, 8)} — ${ge.result.stderr.trim()}`,
      { sha, subpath },
    );
  }
  rmrf(indexFile);
}

/**
 * Run `fn` against a scratch export of `sha`, then delete the scratch
 * directory — even when `fn` throws, so a failed install never leaves
 * bytes behind in the cache.
 *
 * `fn` receives the directory matching the source root: the export root
 * when `subpath` is empty, otherwise the subpath inside it. That root is
 * checked for symlink escapes first (CLAUDE.md design decision #9): a
 * repository can commit a symlink at the subpath itself, and following
 * it would read content from outside the requested commit entirely.
 */
export function withExportedTree<T>(
  clonePath: string,
  sha: string,
  subpath: string,
  home: string,
  fn: (rootDir: string) => T,
): T {
  const cacheRoot = paths(home).gitCacheDir;
  ensureDir(cacheRoot);
  const dest = mkdtempSync(join(cacheRoot, `${sha.slice(0, 8)}-`));
  try {
    exportTreeAt(clonePath, sha, subpath, dest);
    const rootDir = subpath.length > 0 ? join(dest, subpath) : dest;
    assertNoSymlinkEscape(dest, rootDir, subpath);
    return fn(rootDir);
  } finally {
    rmrf(dest);
  }
}
