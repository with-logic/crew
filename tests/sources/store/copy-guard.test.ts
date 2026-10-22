/** Store scope releases its allocation after a real copy-boundary failure (§9 step 8, §13). */

import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { copySourceTree } from "../../../src/sources/read.ts";
import { withStoreStaging } from "../../../src/sources/staging.ts";
import { storeFixture } from "./fixtures.ts";

test("C-INST-23 copy-boundary CrewError removes only its stage and retains error identity", () => {
  const fixture = storeFixture();
  const outside = join(fixture.root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "payload"), "outside bytes");
  const canonical = join(fixture.store, "existing@cccccccc");
  mkdirSync(canonical);
  writeFileSync(join(canonical, "payload"), "published bytes");
  const samePrefixPeer = `${fixture.final}.staging-independently-owned`;
  mkdirSync(samePrefixPeer);
  writeFileSync(join(samePrefixPeer, "payload"), "same-prefix peer bytes");
  const sourceBytes = readFileSync(join(fixture.source, "SKILL.md"));
  let allocated = "";
  let original: CrewError | undefined;
  let failure: unknown;
  let originalMessage = "";
  let originalDetails: Record<string, unknown> | undefined;
  let originalRemedy: string | null | undefined;
  let rejectedPath = "";
  try {
    withStoreStaging(fixture.final, (staging) => {
      allocated = staging;
      rejectedPath = join(staging, "redirect");
      symlinkSync(outside, rejectedPath);
      try {
        copySourceTree(fixture.source, join(rejectedPath, "nested"), fixture.store);
      } catch (err) {
        original = err as CrewError;
        originalMessage = original.message;
        originalDetails = original.details;
        originalRemedy = original.remedy;
        throw err;
      }
    });
  } catch (err) {
    failure = err;
  }
  expect(failure).toBeInstanceOf(CrewError);
  expect(failure).toBe(original);
  expect(original?.code).toBe("usage_error");
  expect(original?.exitCode).toBe(4);
  expect(original?.message).toBe(originalMessage);
  expect(original?.details).toEqual({ path: rejectedPath });
  expect(original?.details).toBe(originalDetails!);
  expect(original?.remedy).toBe(originalRemedy);
  expect(original?.remedy).toContain("destination symlinks");
  expect(allocated).toStartWith(`${fixture.final}.staging-`);
  expect(existsSync(allocated)).toBe(false);
  expect(existsSync(fixture.final)).toBe(false);
  expect(existsSync(join(outside, "nested"))).toBe(false);
  expect(readdirSync(fixture.store).sort()).toEqual(
    [basename(canonical), basename(fixture.peer), basename(samePrefixPeer)].sort(),
  );
  expect(readFileSync(join(outside, "payload"), "utf8")).toBe("outside bytes");
  expect(readFileSync(join(canonical, "payload"), "utf8")).toBe("published bytes");
  expect(readFileSync(join(fixture.peer, "payload"), "utf8")).toBe("peer bytes");
  expect(readFileSync(join(samePrefixPeer, "payload"), "utf8")).toBe("same-prefix peer bytes");
  expect(readFileSync(join(fixture.source, "SKILL.md"))).toEqual(sourceBytes);
});
