/**
 * Shared advisory-lock primitive (§14).
 *
 * `proper-lockfile` guards one target path at a time. Both the state
 * lock (`state.json`) and the per-tap clone locks (§10.1 step 1) need
 * the same behaviour — atomic acquire, stale reclamation, bounded
 * retry, `state_locked` on timeout — so the retry loop lives here and
 * each caller supplies the path it guards.
 */

import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { CrewError } from "../core/errors.ts";
import { ensureDir, exists, touch } from "../util/fs.ts";

/** Handle representing a held advisory lock. */
export interface HeldLock {
  /** Release the lock. Safe to call multiple times. */
  release(): void;
}

const SPEC_TIMEOUT_MS = 30_000;

/**
 * §14's 30 s lock timeout, overridable via `CREW_LOCK_TIMEOUT_MS`.
 * Tests that assert blocking behaviour would otherwise wait the full
 * 30 s; the env var keeps that seam out of the command signatures,
 * matching how `CREW_HOME` and `CREW_NOW` are handled.
 */
export function defaultTimeoutMs(): number {
  const override = Number(process.env["CREW_LOCK_TIMEOUT_MS"]);
  return Number.isFinite(override) && override > 0 ? override : SPEC_TIMEOUT_MS;
}

/**
 * Acquire an advisory lock on `target`, blocking up to `timeoutMs`.
 * Throws `state_locked` if it cannot be acquired within the timeout.
 * `target` is touched if absent: `proper-lockfile` requires the guarded
 * path to exist.
 */
export function acquireLock(target: string, timeoutMs: number = defaultTimeoutMs()): HeldLock {
  ensureDir(dirname(target));
  if (!exists(target)) {
    touch(target);
  }

  const deadline = Date.now() + timeoutMs;
  const pollMs = 100;
  for (;;) {
    try {
      const release = lockfile.lockSync(target, {
        stale: 60_000,
        realpath: false,
        lockfilePath: `${target}.lock`,
      });
      let released = false;
      return {
        release(): void {
          if (released) return;
          released = true;
          try {
            release();
          } catch {
            /* ignore double-release etc. */
          }
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // "ELOCKED" means someone else holds it — retry until deadline.
      if (code !== "ELOCKED") throw err;
      if (Date.now() >= deadline) {
        throw new CrewError(
          "state_locked",
          `another crew process is holding a lock on \`${target}\` (waited ${Math.round(timeoutMs / 1000)}s)`,
          { lockPath: `${target}.lock`, timeoutMs },
        );
      }
      Bun.sleepSync(pollMs);
    }
  }
}

/** Run `fn` while holding an advisory lock on `target`; always release. */
export function withLock<T>(
  target: string,
  fn: () => T,
  timeoutMs: number = defaultTimeoutMs(),
): T {
  const lock = acquireLock(target, timeoutMs);
  try {
    return fn();
  } finally {
    lock.release();
  }
}
