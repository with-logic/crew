/**
 * Finding the projects beneath a project (§9.2): in a repository with
 * several projects, each directory that has its own `.crewrc`.
 *
 * Two steps. git lists the candidates, so the answer follows the
 * repository's own idea of what belongs to it: tracked files and new ones
 * not yet added, but nothing `.gitignore` excludes (a `node_modules` tree,
 * a build directory) and nothing inside another repository nested in this
 * one. Then each candidate is checked on disk, because git lists paths and
 * does not vouch for what is at them now.
 */

import { lstatSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { CrewError } from "../core/errors.ts";
import { GitProcessError, runGit } from "../git/exec.ts";
import { readFileAt } from "./load.ts";
import { MANIFEST_FILENAME } from "./parse.ts";

/**
 * The projects strictly beneath `root`: every candidate git lists that
 * `isOwnProject` accepts, as absolute paths in a stable order. Raises
 * `manifest_invalid` for a candidate that must not be applied.
 */
export function nestedProjectDirs(root: string): string[] {
  return nestedManifestCandidateDirs(root).filter((dir) => isOwnProject(root, dir));
}

/**
 * Whether the candidate `dir`, beneath `root`, is a project of this
 * repository in its own right.
 *
 * False when it is simply gone: git also lists a tracked manifest that has
 * been deleted from the work tree, with or without its directory. Raises
 * `manifest_invalid` when something is there that must not be applied: a
 * directory on the way that is a symbolic link, which may lead out of the
 * repository, or a `.crewrc` that is not a regular file, which a search
 * for the governing manifest would pass over in favor of one further up.
 *
 * Each directory from `root` down is examined without following links, so
 * a link is seen as a link whatever it points at, or at nothing. The answer
 * describes the filesystem at the moment it is given: a caller that acts
 * on a candidate later asks again immediately before it does.
 */
export function isOwnProject(root: string, dir: string): boolean {
  const file = join(dir, MANIFEST_FILENAME);
  let at = root;
  for (const segment of relative(root, dir).split(sep)) {
    at = join(at, segment);
    const stat = lstatSync(at, { throwIfNoEntry: false });
    if (stat === undefined) return false;
    if (stat.isSymbolicLink()) {
      throw new CrewError(
        "manifest_invalid",
        `${file}: ${at} is a symbolic link, so this manifest is not applied as part of the repository`,
        { file },
      );
    }
  }
  const found = readFileAt(file);
  if (found.kind === "other") {
    throw new CrewError("manifest_invalid", `${file} is not a regular file`, { file });
  }
  return found.kind === "file";
}

/**
 * The directories strictly beneath `root` where git lists a `.crewrc`, as
 * absolute paths in a stable order. These are candidates only: a listed
 * file may have been deleted from the work tree, or its directory replaced
 * by a link. `nestedProjectDirs` is the checked list. Empty when `root` is
 * not inside a git work tree: without one there is nothing to say which
 * directories belong.
 *
 * Only git saying "not a git repository" counts as being outside one. Any
 * other failure, to answer that question or to list the files, is raised,
 * not read as "none": that would silently skip every nested project.
 */
export function nestedManifestCandidateDirs(root: string): string[] {
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
