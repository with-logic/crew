/** Physical adapter-base batches, independent of crew home (§6, §14). */
import { realpathSync, statSync } from "node:fs";
import { acquireLock, type HeldLock } from "../../util/advisory-lock.ts";
import { ensureDir } from "../../util/fs.ts";
import { isTargetPreparationPermissionError, prepareTargetSentinel } from "./sentinel.ts";

export interface TargetBase {
  readonly path: string;
  /** Install attempts may retain permission failures; metadata/removal requests are strict. */
  readonly create: boolean;
}
/** Install-base preparation/admission failures are deferred to ordinary target attempts (§14). */
export type TargetBaseFailures = ReadonlyMap<string, NodeJS.ErrnoException>;

interface PhysicalBase {
  readonly path: string;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly aliases: string[];
  strict: boolean;
}

/** Inspection failures on existing directories must never become unlocked writes (§14). */
function inspect(path: string) {
  try {
    return statSync(path, { bigint: true, throwIfNoEntry: false });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOTDIR") return undefined;
    throw err;
  }
}

/** Acquire the complete eligible physical set before any target-dependent decision. */
export function withTargetLocks<T>(
  bases: readonly TargetBase[],
  fn: (failures: TargetBaseFailures, unavailableBases: ReadonlySet<string>) => T,
): T {
  const requested = new Map<string, { create: boolean; strict: boolean }>();
  for (const base of bases) {
    const previous = requested.get(base.path);
    requested.set(base.path, {
      create: base.create || previous?.create === true,
      strict: !base.create || previous?.strict === true,
    });
  }
  const failures = new Map<string, NodeJS.ErrnoException>();
  const unavailable = new Set<string>();
  const physical = new Map<string, PhysicalBase>();
  for (const [path, { create, strict }] of requested) {
    let stat = inspect(path);
    if (!stat?.isDirectory() && create) {
      try {
        ensureDir(path);
      } catch (err) {
        // A concurrent creator may have established a real base despite mkdir failing.
        stat = inspect(path);
        if (!stat?.isDirectory()) failures.set(path, err as NodeJS.ErrnoException);
      }
      if (!failures.has(path)) stat = inspect(path);
    }
    if (!stat?.isDirectory()) {
      unavailable.add(path);
      continue;
    }
    const pathPhysical = realpathSync(path);
    const key = `${stat.dev}:${stat.ino}`;
    const existing = physical.get(key);
    if (existing) {
      existing.aliases.push(path);
      existing.strict ||= strict;
    } else {
      physical.set(key, {
        path: pathPhysical,
        dev: stat.dev,
        ino: stat.ino,
        aliases: [path],
        strict,
      });
    }
  }
  const ordered = [...physical.values()].sort((a, b) => Number(a.dev - b.dev || a.ino - b.ino));
  const held: HeldLock[] = [];
  try {
    for (const base of ordered) {
      try {
        held.push(acquireLock(prepareTargetSentinel(base.path)));
      } catch (err) {
        if (!isTargetPreparationPermissionError(err, base.path) || base.strict) throw err;
        // §14: no target-dependent read/write may occur through any failed alias.
        for (const alias of base.aliases) failures.set(alias, err);
      }
    }
    return fn(failures, unavailable);
  } finally {
    for (const lock of held.reverse()) lock.release();
  }
}
