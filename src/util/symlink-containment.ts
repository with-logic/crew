/**
 * Symlink containment for subpaths resolved against a source root
 * (CLAUDE.md design decision #9; §8.4).
 *
 * `normalizeSubpath` (`src/refs/subpath.ts`) proves a subpath is a
 * well-formed relative path, but a string check cannot see what the
 * filesystem does with it. A repository is free to commit
 * `outside -> /absolute/path`, and a clone recreates it faithfully, so
 * a lexically clean `repo//outside` still resolves to content that
 * never lived in the repository.
 *
 * Discovery and hashing already refuse to follow symlinks *inside* a
 * skill. This closes the remaining hole: the root handed to them, and
 * every directory between the source root and it.
 */

import { lstatSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import { toPosix } from "./fs.ts";

/**
 * Throw unless `target` is reachable from `root` without traversing a
 * symlink.
 *
 * Checks every path segment, not just the leaf: a symlinked parent
 * directory redirects just as effectively as a symlinked leaf. The
 * caller supplies `describe` so the message names the thing the user
 * typed (a tap, a reference) rather than an internal path.
 */
export function assertNoSymlinkEscape(root: string, target: string, describe: string): void {
  const rootAbs = resolve(root);
  let current = resolve(target);
  // Walk from the target up to the root, rejecting any symlink on the
  // way. `dirname` terminates at the filesystem root, so the loop is
  // bounded even when `target` sits outside `root`.
  while (current.length > rootAbs.length) {
    // Callers check the resolved location exists first, so every segment
    // between it and the root exists too — `lstatSync` cannot fail here.
    if (lstatSync(current).isSymbolicLink()) {
      throw new CrewError(
        "invalid_ref",
        `${describe} resolves through a symlink, which would read content from outside the source`,
        { offending: toPosix(relative(rootAbs, current)) },
      );
    }
    current = dirname(current);
  }
}
