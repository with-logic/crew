/**
 * `stageIntoStore` failures (§9 step 8; C-SPEC-16): a file of the skill
 * crew can't read is `source_unreachable` naming that file, and the
 * half-made copy is removed rather than left for `crew doctor` to report.
 */

import { expect, test } from "bun:test";
import { chmodSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import { stageIntoStore } from "../../src/sources/store.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("C-SPEC-16 a skill crew can't copy names the file and leaves no partial copy", () => {
  const src = makeTempDir();
  makeSkill(src, "locked", skillFrontmatter({ name: "locked" }));
  writeFileSync(join(src, "locked", "z.txt"), "private");
  chmodSync(join(src, "locked", "z.txt"), 0o000);
  const home = makeTempDir();
  let thrown: unknown;
  try {
    stageIntoStore(join(src, "locked"), "locked", "a".repeat(40), home);
  } catch (err) {
    thrown = err;
  } finally {
    chmodSync(join(src, "locked", "z.txt"), 0o644);
  }
  const err = thrown as CrewError;
  expect([err.code, err.details]).toEqual([
    "source_unreachable",
    { path: join(src, "locked", "z.txt") },
  ]);
  expect(readdirSync(paths(home).storeDir)).toEqual([]);
});
