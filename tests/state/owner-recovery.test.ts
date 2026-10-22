/** Atomic advisory owner publication preserves stale recovery and unrelated entries (§14, C-CONC-01). */
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { acquireLock } from "../../src/util/advisory-lock.ts";
import { lockOwnerFs } from "../../src/util/lock-owner.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

for (const link of [false, true]) {
  test(`C-CONC-01 abandoned owner temporary entries permit stale reclamation (link=${link})`, () => {
    const root = makeTempDir();
    const target = join(root, "target");
    const lock = `${target}.lock`;
    mkdirSync(lock);
    const referent = join(root, "README.md");
    writeFileSync(referent, "project bytes");
    if (link) symlinkSync(referent, join(lock, "owner"));
    else writeFileSync(join(lock, "owner"), "abandoned record");
    utimesSync(lock, new Date(0), new Date(0));
    acquireLock(target, 100).release();
    expect(existsSync(lock)).toBe(false);
    expect(readFileSync(referent, "utf8")).toBe("project bytes");
  });
}

test("C-CONC-01 reserved temporary directories and unrelated directory contents are never removed", () => {
  const root = makeTempDir();
  const lock = join(root, "target.lock");
  mkdirSync(join(lock, "owner"), { recursive: true });
  const bytes = join(lock, "owner", "README.md");
  writeFileSync(bytes, "keep bytes");
  utimesSync(lock, new Date(0), new Date(0));
  expect(() => acquireLock(join(root, "target"), 100)).toThrow("ENOTEMPTY");
  expect(readFileSync(bytes, "utf8")).toBe("keep bytes");
  const other = makeTempDir();
  const unrelated = join(other, "owner");
  writeFileSync(unrelated, "unrelated bytes");
  expect(() => lockOwnerFs(lock).fs.rmdirSync(other)).toThrow("ENOTEMPTY");
  expect(readFileSync(unrelated, "utf8")).toBe("unrelated bytes");
});
