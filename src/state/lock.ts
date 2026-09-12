/**
 * State-lock acquisition (§14).
 *
 * Every command that writes `state.json` or installs into a target
 * acquires an advisory lock before doing so. Read-only commands do not.
 *
 * The lock primitive itself (retry loop, stale reclamation, timeout →
 * `state_locked`) lives in `./advisory-lock.ts`, shared with the
 * per-tap clone locks. The lockfile lives at `<stateFile>.lock`, which
 * matches §6's `state.json.lock` path exactly.
 */

import { crewHome, paths } from "../core/paths.ts";
import { acquireLock, defaultTimeoutMs, type HeldLock, withLock } from "./advisory-lock.ts";

/** Handle representing a held state lock. */
export type StateLock = HeldLock;

/**
 * Acquire the state lock, blocking up to `timeoutMs` (default 30 s).
 * Throws `state_locked` if the lock cannot be acquired within the timeout.
 */
export function acquireStateLock(
  home: string = crewHome(),
  timeoutMs: number = defaultTimeoutMs(),
): StateLock {
  return acquireLock(paths(home).stateFile, timeoutMs);
}

/** Run `fn` while holding the state lock; always release. */
export function withStateLock<T>(
  fn: () => T,
  home: string = crewHome(),
  timeoutMs: number = defaultTimeoutMs(),
): T {
  return withLock(paths(home).stateFile, fn, timeoutMs);
}
