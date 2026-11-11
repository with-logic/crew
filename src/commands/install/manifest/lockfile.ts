/**
 * Reading and writing a project's lockfile during a bare `crew install`
 * (§9.3).
 *
 * Before installing, each git line that has a lock entry is replaced by its
 * pinned form, so it installs the recorded commit whatever the line's
 * branch or tag has moved to since. After a successful install, each git
 * line without an entry gets one, recording the commit it resolved to.
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../../core/errors.ts";
import { canonicalRepoUrl } from "../../../core/repo-url.ts";
import type { ResolvedSkill } from "../../../core/types.ts";
import { sourceIdentityOf } from "../../../install/source-identity.ts";
import {
  type GitManifestEntry,
  LOCK_FILENAME,
  type Lock,
  type Manifest,
  needsLockEntry,
  parseLock,
  pinnedRef,
  readRegularFile,
  serializeLock,
} from "../../../manifest/index.ts";
import { writeText } from "../../../util/fs.ts";

/** The lock of a run that has no manifest. */
export const NO_LOCK: Lock = new Map();

function lockPathFor(manifest: Manifest): string {
  return join(manifest.projectRoot, LOCK_FILENAME);
}

/**
 * The lock recorded beside `manifest`; empty when there is no lockfile.
 *
 * Whatever is at the lock path must be a regular file or nothing. A
 * symbolic link, a directory, or anything else there is `manifest_invalid`,
 * raised here before any skill is installed: crew will not read through a
 * link, and it could not replace the path with a lockfile afterwards
 * without either failing late or taking its permissions from the link's
 * target.
 */
export function readLock(manifest: Manifest): Lock {
  const file = lockPathFor(manifest);
  const found = lstatSync(file, { throwIfNoEntry: false });
  if (found !== undefined && !found.isFile()) {
    throw new CrewError(
      "manifest_invalid",
      `${file} line 1: is not a regular file`,
      { file, line: 1 },
      `Remove whatever is at \`${LOCK_FILENAME}\` and restore the lockfile from version control, or let \`crew install\` write a new one.`,
    );
  }
  const text = readRegularFile(file);
  return text === null ? NO_LOCK : parseLock({ text, file });
}

/** The references to install: each locked line in its pinned form, the rest as written. */
export function refsToInstall(manifest: Manifest, lock: Lock): string[] {
  return manifest.entries.map((entry) => {
    const sha = needsLockEntry(entry) ? lock.get(entry.ref) : undefined;
    return sha === undefined ? entry.ref : pinnedRef(entry, sha);
  });
}

/**
 * Bring the lockfile in line with the manifest after a successful install:
 * keep the entry of each line that still needs one, add an entry for each
 * line that had none, and drop entries for lines that have left.
 *
 * The lockfile is read again here, so an entry another `crew install`
 * published for the same line in the meantime is kept, not overwritten
 * with this run's resolution. The file is written only if it would change;
 * no file is created when no line needs an entry, though an existing one
 * may be rewritten down to its header.
 */
export function recordLock(manifest: Manifest, resolved: readonly ResolvedSkill[]): void {
  const onDisk = readLock(manifest);
  const next = new Map<string, string>();
  for (const entry of manifest.entries) {
    if (!needsLockEntry(entry)) continue;
    const sha = onDisk.get(entry.ref) ?? resolvedCommitOf(entry, resolved);
    if (sha) next.set(entry.ref, sha);
  }
  const text = serializeLock(next);
  if (text !== serializeLock(onDisk)) writeText(lockPathFor(manifest), text);
}

/**
 * The commit an unlocked git line resolved to: that of a resolved skill
 * that came from the line's repository, at the line's own ref, at or
 * beneath its subpath. The ref matters: two lines may name one repository
 * at different refs, and each must get its own commit. Every skill one
 * line resolves to comes from one commit, so the first match is enough.
 */
function resolvedCommitOf(
  entry: GitManifestEntry,
  resolved: readonly ResolvedSkill[],
): string | null | undefined {
  const { url, ref, subpath } = entry.source;
  const root = canonicalRepoUrl(url);
  const isFromLine = (skill: ResolvedSkill): boolean => {
    const { root: skillRoot, location } = sourceIdentityOf(skill.tap, skill.tapRelativePath);
    const isBeneath = subpath === "" || `${location}/`.startsWith(`${subpath}/`);
    return skillRoot === root && skill.ref === ref && isBeneath;
  };
  return resolved.find(isFromLine)?.resolvedSha;
}
