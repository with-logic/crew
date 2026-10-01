/**
 * Per-repository clone locks (§10.1 step 1, §14).
 *
 * A tap's clone is shared mutable state: `refreshTaps` fast-forwards
 * its working tree, while `acquireTap` resolves a SHA from it and the
 * store copies bytes out of it. Without synchronisation a concurrent
 * run can check out commit B in the window between another run
 * resolving commit A and reading its bytes, so state would record A
 * for B's content.
 *
 * Every command that reads or refreshes tap clones therefore holds a
 * lock per physical clone for the whole span it needs them: refresh →
 * re-expansion → per-skill source read and staging. Dry runs hold them
 * too — a preview still fetches, so it still mutates the clone.
 *
 * The lock wraps the COMMAND's span, not a single helper, because the
 * hazard is the window between resolving a SHA and reading bytes at
 * that SHA — a window that spans several calls. `acquireTap` and
 * `refreshTaps` cannot lock internally: the locks are not reentrant, so
 * a helper-level lock would deadlock any caller that already holds one.
 *
 * Locks are acquired in sorted physical clone path order so two runs touching the
 * same set can never deadlock waiting on each other. Lockfiles live
 * under `locks/` — not beside the clones, where they could be mistaken
 * for a tap directory, and not under `cache/`, which `crew cache clean`
 * deletes wholesale.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { paths } from "../core/paths.ts";
import { tapClonePath } from "../core/repo-path.ts";
import type { TapConfig } from "../core/types.ts";
import { acquireLock, type HeldLock } from "../util/advisory-lock.ts";
import { ensureDir } from "../util/fs.ts";

/**
 * Lock target for a physical clone. Exported so tests can hold a specific tap's
 * lock and assert that a run blocks on it. Hashed to keep paths and credential-bearing identities out of lock names.
 */
export function tapLockTarget(tap: TapConfig, home: string): string {
  const digest = createHash("sha256").update(tapClonePath(tap, home)).digest("hex").slice(0, 16);
  return join(paths(home).locksDir, `tap-${digest}`);
}

/**
 * Run `fn` while holding the clone lock for every tap in `taps`.
 * Acquisition is ordered by physical clone path; release is reverse order and
 * always runs. Tap aliases sharing a physical clone lock once.
 */
export function withTapLocks<T>(taps: readonly TapConfig[], home: string, fn: () => T): T {
  const clones = new Map(taps.map((tap) => [tapClonePath(tap, home), tap]));
  const targets = [...clones.keys()].sort().map((clone) => tapLockTarget(clones.get(clone)!, home));
  if (targets.length === 0) return fn();
  ensureDir(paths(home).locksDir);

  const held: HeldLock[] = [];
  try {
    for (const target of targets) {
      held.push(acquireLock(target));
    }
    return fn();
  } finally {
    for (const lock of held.reverse()) lock.release();
  }
}
