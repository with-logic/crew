/** Atomic owner publication preserves stale recovery and rejects reserved lock links (§14). */
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { lockOwnerFs } from "../../../src/util/lock-owner.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

for (const link of [false, true]) {
  test(`C-CONC-06 a reserved lock-directory link is rejected (dangling=${link})`, () => {
    const base = makeTempDir();
    const referent = join(makeTempDir(), "outside");
    if (!link) mkdirSync(referent);
    const before = link ? null : statSync(referent).mtimeMs;
    symlinkSync(referent, join(base, ".crew-target.lock"));
    const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
    process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
    try {
      let failure: unknown;
      try {
        withTargetLocks([{ path: base, create: false }], () => {});
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "usage_error" });
      if (link) expect(existsSync(referent)).toBe(false);
      else expect(statSync(referent).mtimeMs).toBe(before!);
    } finally {
      if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
      else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
    }
  });
}

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
