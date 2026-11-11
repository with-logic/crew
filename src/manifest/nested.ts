/**
 * Finding the manifests beneath a project (§9.2): in a repository with
 * several projects, each directory that has its own `.crewrc`.
 *
 * git does the looking, so the answer follows the repository's own idea of
 * what belongs to it: tracked files and new ones not yet added, but nothing
 * `.gitignore` excludes (a `node_modules` tree, a build directory) and
 * nothing inside another repository nested in this one.
 */

import { dirname, join } from "node:path";
import { runGit } from "../git/exec.ts";
import { MANIFEST_FILENAME } from "./parse.ts";

/**
 * The directories strictly beneath `root` that hold a `.crewrc`, as
 * absolute paths in a stable order. Empty when `root` is not inside a git
 * repository: without one there is nothing to say which directories belong.
 */
export function nestedManifestDirs(root: string): string[] {
  const listed = runGit(
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      `:(glob)**/${MANIFEST_FILENAME}`,
    ],
    { cwd: root, throwOnError: false },
  );
  if (listed.exitCode !== 0) return [];
  const dirs = new Set<string>();
  for (const file of listed.stdout.split("\0")) {
    // Paths are relative to `root`. The root's own manifest is not nested.
    if (file === "" || file === MANIFEST_FILENAME) continue;
    dirs.add(join(root, dirname(file)));
  }
  return [...dirs].sort();
}
