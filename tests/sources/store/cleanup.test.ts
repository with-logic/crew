/** Store failures release only owned staging and retain primary diagnostics (§9 step 8, §13). */

import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { sanitizeLine } from "../../../src/util/redact.ts";
import { storeFixture, withDeniedStoreWrites } from "./fixtures.ts";

type NativeFailure = NodeJS.ErrnoException & { readonly dest?: string };

test("C-INST-23 rename failure removes own stage and preserves the final symlink and peer", () => {
  const fixture = storeFixture();
  const absent = join(fixture.root, "missing-target");
  symlinkSync(absent, fixture.final);
  let failure: NativeFailure | undefined;
  try {
    stageIntoStore(fixture.source, "demo", "a".repeat(40), fixture.home);
  } catch (err) {
    failure = err as NativeFailure;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure?.syscall).toBe("rename");
  expect(failure?.dest).toBe(fixture.final);
  expect(failure?.path).toStartWith(`${fixture.final}.staging-`);
  expect(readlinkSync(fixture.final)).toBe(absent);
  expect(readdirSync(fixture.store).sort()).toEqual([
    basename(fixture.final),
    basename(fixture.peer),
  ]);
  expect(readFileSync(join(fixture.peer, "payload"), "utf8")).toBe("peer bytes");
  expect(readFileSync(join(fixture.source, "SKILL.md"), "utf8")).toContain("name: demo");
});

for (const sourceFailure of [false, true]) {
  test(`C-INST-23 cleanup denial preserves ${sourceFailure ? "source CrewError" : "native rename failure"} and reports owned staging`, async () => {
    const fixture = storeFixture();
    // Enough small files let the ready child observe allocation before synchronous copying ends.
    for (let i = 0; i < 2000; i++) writeFileSync(join(fixture.source, `asset-${i}`), "owned bytes");
    const blocked = join(fixture.source, readdirSync(fixture.source).at(-1)!);
    if (sourceFailure) chmodSync(blocked, 0);
    let failure: NativeFailure | CrewError | undefined;
    try {
      const observer = await withDeniedStoreWrites(fixture, (ready) => {
        expect(ready).toBe(true);
        try {
          stageIntoStore(fixture.source, "demo", "a".repeat(40), fixture.home);
        } catch (err) {
          failure = err as NativeFailure | CrewError;
        }
        const staging = readdirSync(fixture.store).find((name) => name.startsWith("demo@"))!;
        const retained = join(fixture.store, staging);
        expect(existsSync(retained)).toBe(true);
        expect(existsSync(fixture.final)).toBe(false);
        if (sourceFailure) {
          expect(failure).toBeInstanceOf(CrewError);
          const primary = failure as CrewError;
          expect(primary.code).toBe("source_unreachable");
          expect(primary.exitCode).toBe(5);
          expect(primary.details).toEqual({ path: blocked });
          expect(primary.remedy).toContain("source file");
        } else {
          expect(failure?.code).toBe("EACCES");
          expect((failure as NativeFailure).syscall).toBe("rename");
          expect((failure as NativeFailure).path).toBe(retained);
          expect((failure as NativeFailure).dest).toBe(fixture.final);
        }
        expect(failure?.message).toContain("store staging cleanup failed");
        expect(failure?.message).toContain(sanitizeLine(retained));
        expect(failure?.message).toContain("EACCES");
        expect(readFileSync(join(fixture.peer, "payload"), "utf8")).toBe("peer bytes");
      });
      expect(observer.exitCode).toBe(0);
      expect(observer.stderr).toBe("");
    } finally {
      if (sourceFailure) chmodSync(blocked, 0o600);
    }
    expect(readFileSync(blocked, "utf8").length).toBeGreaterThan(0);
  });
}
