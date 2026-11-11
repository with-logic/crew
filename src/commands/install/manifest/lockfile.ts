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
import { CrewError } from "../../../core/errors.ts";
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
  readFileAt,
  serializeLock,
} from "../../../manifest/index.ts";
import { writeText } from "../../../util/fs.ts";
import { hasChangedOnDisk } from "./freshness.ts";

function lockPathFor(manifest: Manifest): string {
  return join(manifest.projectRoot, LOCK_FILENAME);
}

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
  const file = lockPathFor(manifest);
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

/**
 * Bring the lockfile in line with the manifest after a successful install:
 * keep the entry of each line that still needs one, add an entry for each
 * line that had none, and drop entries for lines that have left.
 *
 * Returns false, having written nothing, when `.crewrc` is no longer the
 * manifest this run read: its lines are not the ones to record.
 *
 * The lockfile is read again here, and an entry it holds for a line is
 * kept in preference to this run's own resolution. That is not a lock:
 * overlapping installs of one checkout are not serialized, and if two both
 * find no entry, the later write stands. What settles a project's versions
 * is the lockfile that gets committed.
 *
 * The file is written only if it would change. No file is created when no
 * line needs an entry, though an existing one may be rewritten down to its
 * header.
 */
export function recordLock(manifest: Manifest, resolved: readonly ResolvedSkill[]): boolean {
  const onDisk = readLock(manifest);
  const resolvedByRepository = groupByRepository(resolved);
  const next = new Map<string, string>();
  for (const entry of manifest.entries) {
    if (!needsLockEntry(entry)) continue;
    const sha = onDisk.get(entry.ref) ?? resolvedCommitOf(entry.source, resolvedByRepository);
    if (sha) next.set(entry.ref, sha);
  }
  const text = serializeLock(next);
  if (text === serializeLock(onDisk)) return true;
  // Checked last, immediately before the write it guards.
  if (hasChangedOnDisk(manifest)) return false;
  writeText(lockPathFor(manifest), text);
  return true;
}

/** Where in its repository a resolved skill came from, and at what ref and commit. */
interface LocatedSkill {
  readonly location: string;
  readonly ref: string | null;
  readonly resolvedSha: string | null;
}

/** The resolved skills of each repository, keyed by its canonical URL. */
function groupByRepository(resolved: readonly ResolvedSkill[]): Map<string, LocatedSkill[]> {
  const groups = new Map<string, LocatedSkill[]>();
  for (const skill of resolved) {
    const { root, location } = sourceIdentityOf(skill.tap, skill.tapRelativePath);
    const group = groups.get(root) ?? [];
    group.push({ location, ref: skill.ref, resolvedSha: skill.resolvedSha });
    groups.set(root, group);
  }
  return groups;
}

/**
 * The commit an unlocked git line resolved to: that of a resolved skill
 * that came from the line's repository, at or beneath its subpath.
 *
 * A skill resolved at the line's own ref is preferred, because two lines
 * may name one repository at different refs and each must get its own
 * commit. If there is none, the line's skills were deduplicated into those
 * of another line: the resolver keeps one copy of a skill that two lines
 * reach at the same commit, and rejects the install if they reach it at
 * different ones. So any skill from that location carries the line's commit.
 */
function resolvedCommitOf(
  source: GitSource,
  resolvedByRepository: ReadonlyMap<string, readonly LocatedSkill[]>,
): string | null | undefined {
  const fromRepository = resolvedByRepository.get(canonicalRepoUrl(source.url)) ?? [];
  let atAnotherRef: LocatedSkill | undefined;
  for (const skill of fromRepository) {
    const isBeneath =
      source.subpath === "" || `${skill.location}/`.startsWith(`${source.subpath}/`);
    if (!isBeneath) continue;
    if (skill.ref === source.ref) return skill.resolvedSha;
    atAnotherRef ??= skill;
  }
  return atAnotherRef?.resolvedSha;
}
