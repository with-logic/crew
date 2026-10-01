/**
 * Protect live advisory-lock owners during synchronous work (§14).
 * proper-lockfile's timers cannot run during spawnSync/sleepSync. An
 * inode-bound PID record prevents contenders treating a live owner as
 * stale. Dead owners and legacy locks retain the library's stale recovery.
 */

import * as fs from "node:fs";

/** Build a per-acquisition filesystem view for proper-lockfile. */
export function lockOwnerFs(lockPath: string): {
  readonly fs: typeof fs;
  record(): void;
} {
  let owned = false;
  return {
    fs: {
      ...fs,
      statSync: ((path: fs.PathLike) => {
        const stat = fs.statSync(path);
        // Our heartbeat must see the real mtime; only contenders use liveness.
        if (!owned && String(path) === lockPath && hasLiveOwner(lockPath, stat)) {
          stat.mtime = new Date();
        }
        return stat;
      }) as typeof fs.statSync,
    },
    record(): void {
      const stat = fs.statSync(lockPath);
      fs.writeFileSync(`${lockPath}.owner`, `${process.pid} ${stat.ino} ${stat.birthtimeMs}`);
      // Leave the sidecar on release: deleting it after rmdir could delete
      // a successor's record. Its directory identity makes old records inert.
      owned = true;
    },
  };
}

function hasLiveOwner(lockPath: string, stat: fs.Stats): boolean {
  let record: string;
  try {
    record = fs.readFileSync(`${lockPath}.owner`, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  const [pid, inode, birthtime] = record.split(" ").map(Number);
  if (!pid || inode !== stat.ino || birthtime !== stat.birthtimeMs) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM still proves the process exists; only ESRCH proves it died.
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
