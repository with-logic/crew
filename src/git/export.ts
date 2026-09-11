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
 * `exportTreeAt` writes the requested tree into a scratch directory under
 * `~/.crew/cache/git/` via `git archive`, which reads straight from the
 * object database and never touches the working tree, the index, or
 * `.git/worktrees`. That makes it safe against a shared clone and it
 * behaves identically on macOS and Linux. The archive goes to a file
 * rather than a pipe so it stays on the existing `runGit` seam, whose
 * results are strings and would corrupt binary tar output.
 *
 * `withExportedTree` wraps the common "use it, then delete it" shape so
 * a thrown error can't leak a directory into the cache.
 */

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { ensureDir, rmrf } from "../util/fs.ts";
import { runGit } from "./exec.ts";

/**
 * Extract `sha`'s tree (optionally narrowed to `subpath`) from the clone
 * at `clonePath` into `dest`, which is created if missing.
 *
 * A `subpath` absent at that commit throws `no_skills_found`: the ref
 * resolved fine, the location inside it just isn't there.
 */
export function exportTreeAt(clonePath: string, sha: string, subpath: string, dest: string): void {
  ensureDir(dest);
  const tarPath = join(dest, ".crew-export.tar");
  const args = ["archive", "--format=tar", `--output=${tarPath}`, sha];
  if (subpath.length > 0) args.push("--", subpath);
  const archive = runGit(args, { cwd: clonePath, throwOnError: false });
  if (archive.exitCode !== 0) {
    // `--output` creates the file before git validates its arguments, so
    // clear the empty archive before reporting — `tar` would happily
    // "extract" it and leave the caller with a silently empty tree.
    rmrf(tarPath);
    throw new CrewError(
      "no_skills_found",
      `\`${subpath.length > 0 ? subpath : "."}\` doesn't exist at ${sha.slice(0, 8)}`,
      { sha, subpath },
    );
  }
  // `git archive` produced this tar, so extraction of it can't fail for
  // reasons crew could report better than the raw exit status.
  Bun.spawnSync({ cmd: ["tar", "-xf", tarPath], cwd: dest, stdout: "pipe", stderr: "pipe" });
  rmrf(tarPath);
}

/**
 * Run `fn` against a scratch export of `sha`, then delete the scratch
 * directory — even when `fn` throws, so a failed install never leaves
 * bytes behind in the cache.
 *
 * `fn` receives the directory matching the source root: the export root
 * when `subpath` is empty, otherwise the subpath inside it.
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
    // A subpath missing at this commit already fails inside
    // `exportTreeAt` (git archive rejects the pathspec), so the
    // extracted root is known to exist here.
    exportTreeAt(clonePath, sha, subpath, dest);
    return fn(subpath.length > 0 ? join(dest, subpath) : dest);
  } finally {
    rmrf(dest);
  }
}
