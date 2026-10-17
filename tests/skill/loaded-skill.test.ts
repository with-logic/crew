/**
 * What a loaded skill keeps (§9 step 4): where it is and its parsed
 * frontmatter — never its SKILL.md text, which nothing after validation
 * reads and a resolution holding many skills would otherwise keep whole.
 */

import { expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkill } from "../../src/skill/load.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("a loaded skill keeps its path and frontmatter, not its text", () => {
  const folder = makeSkill(makeTempDir(), "big", skillFrontmatter({ name: "big" }));
  appendFileSync(join(folder, "SKILL.md"), `${"x".repeat(100_000)}\n`);
  const loaded = loadSkill(folder);
  expect(Object.keys(loaded).sort()).toEqual(["frontmatter", "path"]);
  expect(loaded.frontmatter.name).toBe("big");
  expect(JSON.stringify(loaded).length).toBeLessThan(1_000);
});
