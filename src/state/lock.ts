/**
 * State-lock acquisition (§14).
 *
 * Every command that writes `state.json` or installs into a target
 * acquires an advisory lock before doing so. Read-only commands do not.
 *
 * We use `proper-lockfile`, a battle-tested PID-file lock library
 * (npm:proper-lockfile). It handles:
 *
 *   - atomic O_EXCL create of the lock directory;
 *   - stale-lock detection via PID liveness and mtime;
 *   - cross-platform correctness.
 *
 * The library's lockfile actually lives at `<stateFile>.lock` (a sibling
 * directory), which matches §6's `state.json.lock` path exactly.
 */

import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import { ensureDir, exists, touch } from "../util/fs.ts";

/** Handle representing a held state lock. */
export interface StateLock {
  /** Release the lock. Safe to call multiple times. */
  release(): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Acquire the state lock, blocking up to `timeoutMs` (default 30 s).
 * Throws `state_locked` if the lock cannot be acquired within the timeout.
 */
export function acquireStateLock(
  home: string = crewHome(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): StateLock {
  const stateFile = paths(home).stateFile;
  ensureDir(dirname(stateFile));

  // proper-lockfile requires the target file to exist. `state.json` may
  // not yet — this is the first crew run — so touch it.
  if (!exists(stateFile)) {
    touch(stateFile);
  }

  const deadline = Date.now() + timeoutMs;
  const pollMs = 100;
  for (;;) {
    try {
      const release = lockfile.lockSync(stateFile, {
        stale: 60_000,
        realpath: false,
        // Our `.lock` suffix matches §6 exactly.
        lockfilePath: `${stateFile}.lock`,
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
          `another crew process is holding the state lock (waited ${Math.round(timeoutMs / 1000)}s)`,
          { lockPath: `${stateFile}.lock`, timeoutMs },
        );
      }
      Bun.sleepSync(pollMs);
    }
  }
}

/** Run `fn` while holding the state lock; always release. */
export function withStateLock<T>(
  fn: () => T,
  home: string = crewHome(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): T {
  const lock = acquireStateLock(home, timeoutMs);
  try {
    return fn();
  } finally {
    lock.release();
  }
}
