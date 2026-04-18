/**
 * State-lock acquisition (§14).
 *
 * Every command that writes `state.json` or installs into a target
 * acquires an advisory lock on `~/.crew/state.json.lock` before doing so.
 * Read-only commands do not take the lock.
 *
 * We implement a PID-file lock with `O_EXCL` creation. It is correct for
 * single-user CLI usage on macOS:
 *
 *   - Process A creates the lock with its PID and holds it while it runs.
 *   - Process B attempts to create; fails with `EEXIST`; polls every
 *     100 ms, checking whether A is still alive.
 *   - If A has exited (normal or crashed) before releasing, B detects
 *     the stale lock via `kill -0 <pid>`, unlinks it, and retries.
 *   - If A never exits, B gives up after 30 s and throws `state_locked`.
 */

import { closeSync, constants, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import { ensureDir } from "../util/fs.ts";

/** Handle representing a held state lock. */
export interface StateLock {
  /** Release the lock. Safe to call multiple times. */
  release(): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;

/**
 * Acquire the state lock, blocking up to `timeoutMs` (default 30 s).
 * Throws `state_locked` if the lock cannot be acquired within the timeout.
 */
export function acquireStateLock(home: string = crewHome(), timeoutMs: number = DEFAULT_TIMEOUT_MS): StateLock {
  const lockPath = paths(home).stateLock;
  ensureDir(dirname(lockPath));
  const deadline = Date.now() + timeoutMs;
  const pid = process.pid;

  for (;;) {
    try {
      const fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
      writeSync(fd, String(pid));
      let released = false;
      return {
        release(): void {
          if (released) return;
          released = true;
          try {
            closeSync(fd);
          } catch {
            /* ignore close errors */
          }
          try {
            unlinkSync(lockPath);
          } catch {
            /* ignore unlink errors */
          }
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      // Someone else holds it — probe for staleness.
      if (tryReapStaleLock(lockPath)) continue;
      if (Date.now() >= deadline) {
        throw new CrewError("state_locked", `could not acquire ${lockPath} within ${timeoutMs}ms`, { lockPath });
      }
      Bun.sleepSync(POLL_INTERVAL_MS);
    }
  }
}

/**
 * Read the PID written in the lock file; if that process is no longer
 * alive, unlink the file and return true. Otherwise return false.
 */
function tryReapStaleLock(lockPath: string): boolean {
  let held = "";
  try {
    held = readFileSync(lockPath, "utf8").trim();
  } catch {
    return false;
  }
  const heldPid = parseInt(held, 10);
  if (!Number.isFinite(heldPid) || heldPid <= 0) return false;
  if (isAlive(heldPid)) return false;
  try {
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

/** True if the given PID is still a running process. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

/** Wrap a callback to run while the lock is held; always release. */
export function withStateLock<T>(fn: () => T, home: string = crewHome(), timeoutMs: number = DEFAULT_TIMEOUT_MS): T {
  const lock = acquireStateLock(home, timeoutMs);
  try {
    return fn();
  } finally {
    lock.release();
  }
}
