/**
 * Reading a project's lockfile during a bare `crew install` (§9.3).
 *
 * Each git line that has a lock entry is replaced by its pinned form, so it
 * installs the recorded commit whatever the line's branch or tag has moved
 * to since.
 */

import { join } from "node:path";
import { CrewError } from "../../../core/errors.ts";
import {
  LOCK_FILENAME,
  type Lock,
  type Manifest,
  needsLockEntry,
  parseLock,
  pinnedRef,
  readFileAt,
} from "../../../manifest/index.ts";

/** The lock of a project that has no lockfile. */
const NO_LOCK: Lock = new Map();

/**
 * The lock recorded beside `manifest`; empty when there is no lockfile.
 *
 * Whatever is at the lock path must be a regular file or nothing. A
 * symbolic link, a directory, or anything else there is `manifest_invalid`,
 * raised before any skill is installed: crew does not read a lockfile
 * through a link.
 */
export function readLock(manifest: Manifest): Lock {
  const file = join(manifest.projectRoot, LOCK_FILENAME);
  const found = readFileAt(file);
  if (found.kind === "absent") return NO_LOCK;
  if (found.kind === "file") return parseLock({ text: found.text, file });
  throw new CrewError(
    "manifest_invalid",
    `${file} line 1: is not a regular file`,
    { file, line: 1 },
    `Remove whatever is at \`${LOCK_FILENAME}\` and restore the lockfile from version control.`,
  );
}

/** The references to install: each locked line in its pinned form, the rest as written. */
export function refsToInstall(manifest: Manifest, lock: Lock): string[] {
  return manifest.entries.map((entry) => {
    const sha = needsLockEntry(entry) ? lock.get(entry.ref) : undefined;
    return sha === undefined ? entry.ref : pinnedRef(entry, sha);
  });
}
