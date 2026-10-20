/**
 * A backslash is part of a name on POSIX (§12.1, §9 step 3; C-INST-05):
 * a skill folder named `we\..\ird` is that one folder, never a climb, so
 * `<tap>/<skill>@<ref>` reads it from the commit crew exported — not a
 * folder the name would reach if its backslashes were separators.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, skillFrontmatter, tagRepo } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, gitRepo, skillAt } from "./folder-links/helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

const ODD = "we\\..\\ird";

test("C-INST-05 a skill folder whose name holds backslashes installs at a ref as itself", () => {
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    // Read as separators, `skills/we\..\ird` would be `skills/ird`.
    skillAt(join(r, "skills"), "ird");
    makeSkill(join(r, "skills"), ODD, skillFrontmatter({ name: "odd" }), "The odd one.\n");
  });
  tagRepo(repo, "v1");
  const home = makeCrewHome();
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"]).code).toBe(0);
  // `<tap>/<skill>@<ref>` finds the folder in the tap's index, then reads
  // it again from the commit crew exports at the ref.
  const r = crew(home, ["install", "mine/odd@v1"]);
  expect(r.code).toBe(0);
  const entry = readState(home).installations.find((e) => e.name === "odd");
  expect(entry?.source.path).toBe(`skills/${ODD}`);
  expect(readFileSync(join(claude.userRoot, "odd", "SKILL.md"), "utf8")).toContain("The odd one.");
  expect(readdirSync(claude.userRoot)).toEqual(["odd"]);
});
