/** Owner publication errors survive simultaneous native cleanup failures (§14, C-CONC-01). */
import { expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lockOwnerFs } from "../../src/util/lock-owner.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

function caught(operation: () => unknown): unknown {
  try {
    return operation();
  } catch (error) {
    return error;
  }
}

test("C-CONC-01 owner publication preserves open failure when temporary cleanup also fails", () => {
  const lock = join(makeTempDir(), "target.lock");
  const temporary = join(lock, "owner");
  const unrelated = join(lock, "README.md");
  mkdirSync(lock);
  writeFileSync(unrelated, "unrelated bytes");
  chmodSync(lock, 0);
  try {
    expect(statSync(lock).isDirectory()).toBe(true);
    expect(caught(() => writeFileSync(temporary, "probe", { flag: "wx" }))).toMatchObject({
      code: "EACCES",
      syscall: "open",
      path: temporary,
    });
    expect(caught(() => lstatSync(temporary))).toMatchObject({
      code: "EACCES",
      syscall: "lstat",
      path: temporary,
    });
    const failure = caught(() => lockOwnerFs(lock).record());
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ code: "EACCES", syscall: "open", path: temporary });
    expect((failure as Error).stack).toContain("writeFileSync");
  } finally {
    chmodSync(lock, 0o700);
    expect(readFileSync(unrelated, "utf8")).toBe("unrelated bytes");
  }
});

test("C-CONC-01 public acquisition preserves open failure when releasing also fails", () => {
  const target = join(makeTempDir(), "target");
  writeFileSync(target, "prepared target");
  const modulePath = join(import.meta.dir, "../../src/util/advisory-lock.ts");
  // Restrictive umask belongs to a joined child, never the shared test runner.
  const script = `
import {chmodSync,existsSync,lstatSync,statSync,writeFileSync} from "node:fs";
import {acquireLock} from ${JSON.stringify(modulePath)};
const target = ${JSON.stringify(target)};
const lock = target + ".lock";
const temporary = lock + "/owner";
const report = {};
const previous = process.umask(0o777);
try {
  try { acquireLock(target, 100).release(); }
  catch (error) {
    report.failure = {code:error.code,syscall:error.syscall,path:error.path,stack:error.stack};
    report.isError = error instanceof Error;
  }
  report.mode = statSync(lock).mode & 0o777;
  try { writeFileSync(temporary, "probe", {flag:"wx"}); }
  catch (error) { report.write = {code:error.code,syscall:error.syscall,path:error.path}; }
  try { lstatSync(temporary); }
  catch (error) { report.cleanup = {code:error.code,syscall:error.syscall,path:error.path}; }
} finally {
  process.umask(previous);
  if (existsSync(lock)) chmodSync(lock, 0o700);
}
console.log(JSON.stringify(report));
`;
  const child = Bun.spawnSync([process.execPath, "-e", script], { timeout: 5_000 });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const report = JSON.parse(child.stdout.toString());
  const primary = { code: "EACCES", syscall: "open", path: `${target}.lock/owner` };
  expect(report.mode).toBe(0);
  expect(report.write).toEqual(primary);
  expect(report.cleanup).toEqual({ ...primary, syscall: "lstat" });
  expect(report.isError).toBe(true);
  expect(report.failure).toMatchObject(primary);
  expect(report.failure.stack).toContain("writeFileSync");
  expect(readFileSync(target, "utf8")).toBe("prepared target");
});
