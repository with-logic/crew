/**
 * `stageIntoStore` failures (§9 step 8; C-SPEC-16): a file of the skill
 * crew can't read is `source_unreachable` naming that file, and the
 * half-made copy is removed rather than left for `crew doctor` to report.
 * Which side of a failed copy broke is classified on synthetic errors:
 * a full disk can't be produced from a test.
 */

import { expect, test } from "bun:test";
import { chmodSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import { stageIntoStore, stagingError } from "../../src/sources/store.ts";
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

/** A synthetic `node:fs` error for `syscall` on `path`. */
function fsError(code: string, syscall: string, path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: failed, ${syscall} '${path}'`), { code, syscall, path });
}

test("a copy that fails on a source file crew can still read is crew's store failing", () => {
  const src = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const home = makeTempDir();
  const err = stagingError(fsError("ENOSPC", "copyfile", join(src, "SKILL.md")), src, home);
  expect(err.details).toEqual({ store: paths(home).storeDir });
  expect(err.remedy).toContain("the disk has room");
});

test("a source file that went away mid-copy is the skill's, not the store's", () => {
  const src = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const gone = join(src, "notes.txt");
  const err = stagingError(fsError("ENOENT", "copyfile", gone), src, makeTempDir());
  expect(err.details).toEqual({ path: gone });
});
