/** Explicit gist-file loading refuses changed file types (§9 step 4). */
import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkill } from "../../src/skill/load.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("C-GIST-02 file mode never falls back to directory SKILL.md", () => {
  const root = makeTempDir();
  const directory = join(root, "candidate.md");
  mkdirSync(directory);
  writeFileSync(join(directory, "SKILL.md"), "---\nname: valid\ndescription: valid\n---\n");
  expect(() => loadSkill(directory, true)).toThrow("must be a regular file");
  symlinkSync(directory, join(root, "linked.md"));
  expect(() => loadSkill(join(root, "linked.md"), true)).toThrow("must be a regular file");
  expect(() => loadSkill(join(root, "missing.md"), true)).toThrow("no longer exists");
});
