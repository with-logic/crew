/**
 * Per-tap clone locks (§10.1 step 1, §14).
 *
 * A tap's clone is shared mutable state: `refreshTaps` fast-forwards
 * its working tree, while `acquireTap` resolves a SHA from it and the
 * store copies bytes out of it. Without synchronisation a concurrent
 * run can check out commit B in the window between another run
 * resolving commit A and reading its bytes, so state would record A
 * for B's content.
 *
 * Every run that reads or refreshes tap clones therefore holds a lock
 * per tap for the whole span: refresh → re-expansion → per-skill source
 * read and staging. Dry runs hold them too — a preview still fetches,
 * so it still mutates the clone.
 *
 * Locks are acquired in sorted tap-name order so two runs touching the
 * same set can never deadlock waiting on each other. Lockfiles live
 * under `cache/locks/` rather than beside the clones, so nothing in
 * `taps/` is mistaken for a tap directory.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { paths } from "../core/paths.ts";
import type { TapConfig } from "../core/types.ts";
import { acquireLock, type HeldLock } from "../state/advisory-lock.ts";
import { ensureDir } from "../util/fs.ts";

/**
 * Lock target for one tap. Exported so tests can hold a specific tap's
 * lock and assert that a run blocks on it. Hashed because a tap name is only
 * constrained at creation time; a name persisted in config could
 * otherwise escape the lock directory.
 */
export function tapLockTarget(name: string, home: string): string {
  const digest = createHash("sha256").update(name).digest("hex").slice(0, 16);
  return join(paths(home).cacheDir, "locks", `tap-${digest}`);
}

/**
 * Run `fn` while holding the clone lock for every tap in `taps`.
 * Acquisition is ordered by tap name; release is reverse order and
 * always runs. Duplicate names lock once.
 */
export function withTapLocks<T>(taps: readonly TapConfig[], home: string, fn: () => T): T {
  const names = [...new Set(taps.map((t) => t.name))].sort();
  if (names.length === 0) return fn();
  ensureDir(join(paths(home).cacheDir, "locks"));

  const held: HeldLock[] = [];
  try {
    for (const name of names) {
      held.push(acquireLock(tapLockTarget(name, home)));
    }
    return fn();
  } finally {
    for (const lock of held.reverse()) lock.release();
  }
}
