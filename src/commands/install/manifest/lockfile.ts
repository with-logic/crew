/**
 * Reading and writing a project's lockfile during a bare `crew install`
 * (§9.3).
 *
 * Before installing, each git line that has a lock entry is replaced by its
 * pinned form, so it installs the recorded commit whatever the line's
 * branch or tag has moved to since. After a successful install, each git
 * line without an entry gets one, recording the commit it resolved to.
 */

import { join } from "node:path";
import { canonicalRepoUrl } from "../../../core/repo-url.ts";
import type { GitSource, ResolvedSkill } from "../../../core/types.ts";
import { sourceIdentityOf } from "../../../install/source-identity.ts";
import {
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

/** Absolute path of the lockfile that belongs to `manifest`. */
export function lockPathFor(manifest: Manifest): string {
  return join(manifest.projectRoot, LOCK_FILENAME);
}

/**
 * The lock recorded beside `manifest`; empty when there is no lockfile.
 * Like the manifest, a symbolic link there is not a lockfile and is not read.
 */
export function readLock(manifest: Manifest): Lock {
  const file = lockPathFor(manifest);
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
 * The lock after a successful install: existing entries for lines still in
 * the manifest, a new entry for each line that had none, and nothing for a
 * line that has left the manifest.
 */
export function lockAfterInstall(
  manifest: Manifest,
  lock: Lock,
  resolved: readonly ResolvedSkill[],
): Lock {
  const next = new Map<string, string>();
  for (const entry of manifest.entries) {
    if (!needsLockEntry(entry)) continue;
    const sha = lock.get(entry.ref) ?? resolvedCommitOf(entry.source as GitSource, resolved);
    if (sha) next.set(entry.ref, sha);
  }
  return next;
}

/**
 * The commit a git line resolved to: that of the first resolved skill that
 * came from the line's repository, at or beneath its subpath. Every skill
 * a line resolves to comes from one commit, so the first is enough.
 */
function resolvedCommitOf(
  source: GitSource,
  resolved: readonly ResolvedSkill[],
): string | null | undefined {
  const root = canonicalRepoUrl(source.url);
  const isFromLine = (skill: ResolvedSkill): boolean => {
    const { root: skillRoot, location } = sourceIdentityOf(skill.tap, skill.tapRelativePath);
    const isBeneath = source.subpath === "" || `${location}/`.startsWith(`${source.subpath}/`);
    return skillRoot === root && isBeneath;
  };
  return resolved.find(isFromLine)?.resolvedSha;
}

/**
 * Write the lockfile when `after` differs from `before`. An unchanged lock
 * is never rewritten, and a project with nothing to lock gets no lockfile.
 */
export function writeLockIfChanged(manifest: Manifest, before: Lock, after: Lock): void {
  const text = serializeLock(after);
  if (text !== serializeLock(before)) writeText(lockPathFor(manifest), text);
}
