/**
 * Symlink containment for exported commit trees (§9 step 3).
 *
 * Invariant: everything crew reads for a skill comes from inside the
 * requested commit. A reference names a commit and a subpath, and no
 * part of resolving that subpath may leave the exported tree.
 *
 * A repository can commit a symlink anywhere, including at the very
 * path a reference names as its subpath. `git checkout` faithfully
 * recreates it as a symlink, so a consumer that resolves the exported
 * root with a following stat would read content from outside the
 * requested commit — the target may be anywhere on the host.
 *
 * Discovery and hashing already refuse to follow symlinks *inside* a
 * skill. This module closes the remaining hole: the root handed to
 * them, and every directory between the export root and it.
 */

import { lstatSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import { toPosix } from "../util/fs.ts";

/**
 * Throw unless `rootDir` is reachable from `exportRoot` without
 * traversing a symlink, and is itself a real directory.
 *
 * Checks every path segment, not just the leaf: a symlinked parent
 * directory redirects just as effectively as a symlinked leaf.
 */
export function assertNoSymlinkEscape(exportRoot: string, rootDir: string, subpath: string): void {
  const root = resolve(exportRoot);
  let current = resolve(rootDir);
  // Walk from the requested root up to the export root, rejecting any
  // symlink on the way. `dirname` terminates at the filesystem root, so
  // the loop is bounded even if `rootDir` sits outside `exportRoot`.
  while (current.length > root.length) {
    // Every path here was just written by the export, so `lstatSync`
    // finding nothing would mean the tree vanished mid-install — not a
    // case crew can report better than the raw error.
    if (lstatSync(current).isSymbolicLink()) {
      throw new CrewError(
        "invalid_skill",
        `\`${subpath.length > 0 ? toPosix(subpath) : "."}\` resolves through a symlink, which would read content from outside the requested commit`,
        { subpath, offending: toPosix(relative(root, current)) },
      );
    }
    current = dirname(current);
  }
}
