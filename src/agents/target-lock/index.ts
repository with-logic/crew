/** Physical adapter-base batches, independent of crew home (§6, §14). */
import { realpathSync, statSync } from "node:fs";
import { acquireLock, type HeldLock } from "../../util/advisory-lock.ts";
import { ensureDir } from "../../util/fs.ts";
import { prepareTargetSentinel } from "./sentinel.ts";

export interface TargetBase {
  readonly path: string;
  readonly create: boolean;
}
/** Install-base preparation failures are deferred to ordinary target attempts (§14). */
export type TargetBaseFailures = ReadonlyMap<string, NodeJS.ErrnoException>;

/** Inspection failures on existing directories must never become unlocked writes (§14). */
function inspect(path: string) {
  try {
    return statSync(path, { bigint: true, throwIfNoEntry: false });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOTDIR") return undefined;
    throw err;
  }
}

/** Acquire the complete physical set before invoking any target-dependent decision. */
export function withTargetLocks<T>(
  bases: readonly TargetBase[],
  fn: (failures: TargetBaseFailures, unavailableBases: ReadonlySet<string>) => T,
): T {
  const requested = new Map<string, boolean>();
  for (const base of bases)
    requested.set(base.path, base.create || requested.get(base.path) === true);
  const failures = new Map<string, NodeJS.ErrnoException>();
  const unavailable = new Set<string>();
  const physical = new Map<string, { path: string; dev: bigint; ino: bigint }>();
  for (const [path, create] of requested) {
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
    physical.set(`${stat.dev}:${stat.ino}`, {
      path: realpathSync(path),
      dev: stat.dev,
      ino: stat.ino,
    });
  }
  const ordered = [...physical.values()].sort((a, b) => Number(a.dev - b.dev || a.ino - b.ino));
  const held: HeldLock[] = [];
  try {
    for (const base of ordered) held.push(acquireLock(prepareTargetSentinel(base.path)));
    return fn(failures, unavailable);
  } finally {
    for (const lock of held.reverse()) lock.release();
  }
}
