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

import { lstatSync, type Stats } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { CrewError } from "../core/errors.ts";
import { toPosix } from "./fs.ts";

/**
 * Throw unless `target` is contained by `root`: lexically beneath it,
 * and reachable without traversing a symlink.
 *
 * Two checks, and both are required. The lexical one rejects a subpath
 * that climbs out with `..` — persisted config is not re-validated by
 * the reference parser, so a hand-edited or legacy `../…` reaches here
 * with no symlink anywhere for the second check to catch. The symlink
 * walk then covers every path segment, not just the leaf, because a
 * symlinked parent directory redirects just as effectively.
 *
 * The caller supplies `describe` so the message names the thing the
 * user typed (a tap, a reference) rather than an internal path.
 */
export function assertNoSymlinkEscape(root: string, target: string, describe: string): void {
  const rootAbs = resolve(root);
  const targetAbs = resolve(target);
  // `relative` is the lexical test: a target below the root never needs
  // to climb, so a leading `..` means it escaped. An absolute result
  // means the two share no common base at all (different drives).
  const rel = relative(rootAbs, targetAbs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new CrewError(
      "invalid_ref",
      `${describe} resolves outside the source, which would read content that isn't part of it`,
      { offending: toPosix(rel) },
    );
  }
  let current = targetAbs;
  // Walk from the target up to the root, rejecting any symlink on the
  // way. Containment is already proven above, so this terminates at
  // `rootAbs`.
  while (current.length > rootAbs.length) {
    // A segment that doesn't exist is not a containment violation:
    // containment is about where a path points, and a missing path
    // points nowhere. This is the normal shape of a skill deleted
    // upstream, which §10.1 requires be reported as the soft
    // `source_gone` outcome rather than a hard failure. A missing
    // segment also cannot be a symlink, so skipping it removes nothing
    // from the guarantee below.
    const stat = lstatSafe(current);
    if (stat?.isSymbolicLink()) {
      throw new CrewError(
        "invalid_ref",
        `${describe} resolves through a symlink, which would read content from outside the source`,
        { offending: toPosix(relative(rootAbs, current)) },
      );
    }
    current = dirname(current);
  }
}

/**
 * `lstatSync` that reports "absent" as `null` instead of throwing.
 *
 * Only a missing path is absorbed. A permission or I/O failure still
 * throws, because that means we could not determine what the segment
 * is — and a containment check that silently passes on an unreadable
 * segment would be worse than no check.
 */
function lstatSafe(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
