/** Store failures release only owned staging and retain primary diagnostics (§9 step 8, §13). */

import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { copySourceTree } from "../../../src/sources/read.ts";
import { withStoreStaging } from "../../../src/sources/staging.ts";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { sanitizeLine } from "../../../src/util/redact.ts";
import { storeFixture } from "./fixtures.ts";

type NativeFailure = NodeJS.ErrnoException & { readonly dest?: string };

test("C-INST-23 rename failure removes own stage and preserves the final symlink and peer", () => {
  const fixture = storeFixture();
  const samePrefixPeer = `${fixture.final}.staging-independently-owned`;
  mkdirSync(samePrefixPeer);
  writeFileSync(join(samePrefixPeer, "payload"), "same-prefix peer bytes");
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
    basename(samePrefixPeer),
    basename(fixture.peer),
  ]);
  expect(existsSync(samePrefixPeer)).toBe(true);
  expect(readFileSync(join(samePrefixPeer, "payload"), "utf8")).toBe("same-prefix peer bytes");
  expect(readFileSync(join(fixture.peer, "payload"), "utf8")).toBe("peer bytes");
  expect(readFileSync(join(fixture.source, "SKILL.md"), "utf8")).toContain("name: demo");
});

for (const sourceFailure of [false, true]) {
  test(`C-INST-23 production staging scope preserves ${sourceFailure ? "source CrewError" : "native rename failure"} when real cleanup is denied`, () => {
    const fixture = storeFixture();
    const canonical = join(fixture.store, "existing@cccccccc");
    mkdirSync(canonical);
    writeFileSync(join(canonical, "payload"), "published bytes");
    const blocked = join(fixture.source, "asset");
    writeFileSync(blocked, "owned bytes");
    let original: NativeFailure | CrewError | undefined;
    let failure: NativeFailure | CrewError | undefined;
    let originalDetails: Record<string, unknown> | undefined;
    let originalRemedy: string | null | undefined;
    let originalMessage = "";
    let retained = "";
    let deniedMode = 0;
    try {
      withStoreStaging(fixture.final, (staging) => {
        retained = staging;
        if (sourceFailure) chmodSync(blocked, 0);
        chmodSync(fixture.store, 0o500);
        deniedMode = statSync(fixture.store).mode & 0o777;
        try {
          if (sourceFailure) copySourceTree(fixture.source, staging);
          else renameSync(staging, fixture.final);
        } catch (err) {
          original = err as NativeFailure | CrewError;
          originalMessage = original.message!;
          if (original instanceof CrewError) {
            originalDetails = original.details;
            originalRemedy = original.remedy;
          }
          throw err;
        }
      });
    } catch (err) {
      failure = err as NativeFailure | CrewError;
    } finally {
      chmodSync(fixture.store, 0o700);
      if (sourceFailure) chmodSync(blocked, 0o600);
    }
    expect(deniedMode).toBe(0o500);
    expect(failure).toBe(original);
    expect(failure?.message).toStartWith(originalMessage);
    expect(existsSync(retained)).toBe(true);
    expect(existsSync(fixture.final)).toBe(false);
    if (sourceFailure) {
      expect(failure).toBeInstanceOf(CrewError);
      const primary = failure as CrewError;
      expect(primary.code).toBe("source_unreachable");
      expect(primary.exitCode).toBe(5);
      expect(primary.details).toEqual({ path: blocked });
      expect(primary.details).toBe(originalDetails!);
      expect(primary.remedy).toContain("source file");
      expect(primary.remedy).toBe(originalRemedy);
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
    expect(readFileSync(blocked, "utf8").length).toBeGreaterThan(0);
    expect(readFileSync(blocked, "utf8")).toBe("owned bytes");
    expect(readFileSync(join(canonical, "payload"), "utf8")).toBe("published bytes");
  });
}
