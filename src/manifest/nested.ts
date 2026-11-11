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
import { GitProcessError, runGit } from "../git/exec.ts";
import { MANIFEST_FILENAME } from "./parse.ts";

/**
 * The directories strictly beneath `root` that hold a `.crewrc`, as
 * absolute paths in a stable order. Empty when `root` is not inside a git
 * work tree: without one there is nothing to say which directories belong.
 *
 * Only git saying "not a git repository" counts as being outside one. Any
 * other failure, to answer that question or to list the files, is raised,
 * not read as "none": that would silently skip every nested project.
 */
export function nestedManifestDirs(root: string): string[] {
  // LC_ALL=C: the refusal is told apart from other failures by its message.
  const inside = runGit(["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    env: { LC_ALL: "C" },
    throwOnError: false,
  });
  if (inside.exitCode !== 0) {
    if (inside.stderr.includes("not a git repository")) return [];
    // git is refusing or failing for some other reason (an ownership check,
    // a damaged repository). Nested projects may exist, so this is not "none".
    throw new GitProcessError(
      `git could not tell whether ${root} is inside a repository: ${inside.stderr.trim()}`,
      inside,
    );
  }
  // "false" inside a `.git` directory or a bare repository: no work tree to search.
  if (inside.stdout.trim() !== "true") return [];
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
    { cwd: root },
  );
  const dirs = new Set<string>();
  for (const file of listed.stdout.split("\0")) {
    // Paths are relative to `root`. The root's own manifest is not nested.
    if (file === "" || file === MANIFEST_FILENAME) continue;
    dirs.add(join(root, dirname(file)));
  }
  return [...dirs].sort();
}
