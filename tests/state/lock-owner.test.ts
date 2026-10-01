/** Live/dead process ownership during synchronous lock work (§14, C-CONC-01). */

import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { acquireLock } from "../../src/util/advisory-lock.ts";
import { lockOwnerFs } from "../../src/util/lock-owner.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

function ancient(path: string): void {
  utimesSync(path, new Date(0), new Date(0));
}

function ownerRecord(path: string, pid: number): void {
  const stat = statSync(path);
  writeFileSync(`${path}.owner`, `${pid} ${stat.ino} ${stat.birthtimeMs}`);
}

describe("lock process ownership", () => {
  test("C-CONC-01 a contender cannot reclaim a live lock with an expired heartbeat", () => {
    const target = join(makeTempDir(), "target");
    const held = acquireLock(target);
    try {
      ancient(`${target}.lock`);
      // macOS also lowers birthtime when utimes moves mtime before creation.
      ownerRecord(`${target}.lock`, process.pid);
      // spawnSync blocks the owner's timers throughout the contender's run.
      const modulePath = join(import.meta.dir, "../../src/util/advisory-lock.ts");
      const child = Bun.spawnSync([
        process.execPath,
        "-e",
        `import { acquireLock } from ${JSON.stringify(modulePath)};
try { acquireLock(${JSON.stringify(target)}, 100); process.exit(1); }
catch (err) { process.exit(err.code === "state_locked" ? 0 : 2); }`,
      ]);
      expect(child.exitCode).toBe(0);
      expect(statSync(`${target}.lock`).mtimeMs).toBe(0);
    } finally {
      held.release();
    }
    acquireLock(target).release();
  });

  test("an expired dead-owner lock is reclaimed", () => {
    const target = join(makeTempDir(), "target");
    mkdirSync(`${target}.lock`);
    const child = Bun.spawnSync([
      process.execPath,
      "-e",
      "process.stdout.write(String(process.pid))",
    ]);
    ancient(`${target}.lock`);
    ownerRecord(`${target}.lock`, Number(child.stdout.toString()));
    acquireLock(target).release();
  });

  test("malformed or obsolete records cannot protect an abandoned directory", () => {
    const target = join(makeTempDir(), "target");
    mkdirSync(`${target}.lock`);
    for (const record of ["invalid", `${process.pid} 0 0`]) {
      writeFileSync(`${target}.lock.owner`, record);
      ancient(`${target}.lock`);
      acquireLock(target).release();
      mkdirSync(`${target}.lock`);
    }
  });

  test("the owner's heartbeat and other paths see real stat data", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "lock");
    mkdirSync(lockPath);
    const owner = lockOwnerFs(lockPath);
    owner.record();
    ancient(lockPath);
    expect(owner.fs.statSync(lockPath).mtimeMs).toBe(0);
    const unrelated = join(dir, "unrelated");
    writeFileSync(unrelated, "bytes");
    expect(owner.fs.statSync(unrelated).size).toBe(5);
    expect(readFileSync(`${lockPath}.owner`, "utf8")).toContain(String(process.pid));
  });

  test("an owner-record write failure releases the acquired lock and preserves the error", () => {
    const target = join(makeTempDir(), "target");
    const ownerPath = `${target}.lock.owner`;
    // The library can read this sidecar while probing the new lock directory,
    // then record() fails only after lockSync has returned ownership.
    writeFileSync(ownerPath, "readable but unwritable");
    chmodSync(ownerPath, 0o444);
    try {
      let thrown: unknown;
      try {
        acquireLock(target);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toMatchObject({ code: "EACCES" });
      expect(existsSync(`${target}.lock`)).toBe(false);
    } finally {
      chmodSync(ownerPath, 0o644);
    }
    acquireLock(target).release();
  });

  test("owner-record read failures propagate during acquisition", () => {
    const target = join(makeTempDir(), "target");
    mkdirSync(`${target}.lock.owner`);
    expect(() => acquireLock(target)).toThrow();
    expect(() => statSync(`${target}.lock`)).toThrow();
    mkdirSync(`${target}.lock`);
    ancient(`${target}.lock`);
    expect(() => acquireLock(target)).toThrow();
  });
});
