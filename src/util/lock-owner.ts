/**
 * Protect live advisory-lock owners during synchronous work (§14).
 * proper-lockfile's timers cannot run during spawnSync/sleepSync. An
 * inode-bound PID record prevents contenders treating a live owner as
 * stale. Dead owners and legacy locks retain the library's stale recovery.
 */

import * as fs from "node:fs";
import { readOwnerRecord } from "./owner-record.ts";

/** Build a per-acquisition filesystem view for proper-lockfile. */
export function lockOwnerFs(lockPath: string): {
  readonly fs: typeof fs;
  record(): void;
} {
  let owned = false;
  const temporary = `${lockPath}/owner`;
  const ownerPath = `${lockPath}.owner`;
  function removeTemporaryRecord(): void {
    const stat = fs.lstatSync(temporary, { throwIfNoEntry: false });
    if (stat?.isFile() || stat?.isSymbolicLink()) fs.rmSync(temporary, { force: true });
  }
  return {
    fs: {
      ...fs,
      rmdirSync: ((path: fs.PathLike) => {
        // A crash before atomic publication must not block stale reclamation (§14).
        if (String(path) === lockPath) removeTemporaryRecord();
        fs.rmdirSync(path);
      }) as typeof fs.rmdirSync,
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
      // Preserve ordinary write-permission failures without writing through a hardlink.
      if (fs.lstatSync(ownerPath, { throwIfNoEntry: false })?.isFile())
        fs.accessSync(ownerPath, fs.constants.W_OK);
      try {
        fs.writeFileSync(temporary, `${process.pid} ${stat.ino} ${stat.birthtimeMs}`, {
          flag: "wx",
        });
        fs.renameSync(temporary, ownerPath);
      } catch (err) {
        try {
          removeTemporaryRecord();
        } catch {
          // Only native filesystem cleanup runs here; preserve publication's error (§14).
        }
        throw err;
      }
      // Leave the sidecar on release: deleting it after rmdir could delete
      // a successor's record. Its directory identity makes old records inert.
      owned = true;
    },
  };
}

function hasLiveOwner(lockPath: string, stat: fs.Stats): boolean {
  const record = readOwnerRecord(`${lockPath}.owner`);
  if (record === undefined) return false;
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
