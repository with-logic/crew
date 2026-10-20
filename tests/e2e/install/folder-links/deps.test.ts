/**
 * Folder links in sibling-dependency lookup (§9 step 6; C-SPEC-17): a
 * sibling named for the dependency whose folder leads out of the
 * repository fails the install, naming the dependency — whether or not a
 * `SKILL.md` shows through it, and never taken from another tap instead;
 * any other such sibling is passed over unread — at a ref, too.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, gitRepo, link, outsideSkill, skillAt } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** A repository whose `skills/a` depends on `b`, with `skills/b` linked to `b`. */
function repoWithLinkedDep(b: string): string {
  return gitRepo((r) => {
    skillAt(join(r, "skills"), "a", ["b"]);
    link(b, join(r, "skills", "b"));
  });
}

for (const at of ["", "@v1"]) {
  test(`C-SPEC-17 a dependency whose sibling folder leads out fails the install${at && " (at a ref)"}`, () => {
    const repo = repoWithLinkedDep(outsideSkill("b"));
    tagRepo(repo, "v1");
    const r = crew(makeCrewHome(), ["install", `file://${repo}${at}//skills/a`, "--json"]);
    const { error } = JSON.parse(r.out) as {
      error: { name: string; message: string; details: { path: string } };
    };
    expect([r.code, error.name]).toEqual([4, "invalid_skill"]);
    // Named by its place in the repository alone; the full path is in details.
    expect(error.message).toStartWith(
      "dependency `b`: `skills/b` leads out of the repository through a link",
    );
    expect(error.details.path).toEndWith("/skills/b");
    expect(readdirSync(claude.userRoot)).toEqual([]);
  });
}

test("C-SPEC-17 a sibling linked out that isn't named for the dependency is passed over unread", () => {
  // Read, it would declare `b` too, and the lookup would find two.
  const decoy = outsideSkill("decoy", true, "b");
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "a", ["b"]);
    skillAt(join(r, "skills"), "b");
    link(decoy, join(r, "skills", "decoy"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}//skills/a`]);
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot).sort()).toEqual(["a", "b"]);
});

test("C-SPEC-17 a dependency's sibling leading out with no SKILL.md fails, not another tap's", () => {
  const empty = join(makeTempDir("crew-outside-"), "b");
  mkdirSync(empty);
  const repo = repoWithLinkedDep(empty);
  const other = gitRepo((r) => skillAt(join(r, "skills"), "b"));
  const home = makeCrewHome();
  expect(crew(home, ["tap", "add", `file://${other}`, "other"]).code).toBe(0);
  const r = crew(home, ["install", `file://${repo}//skills/a`, "--json"]);
  const { error } = JSON.parse(r.out) as { error: { name: string; message: string } };
  expect([r.code, error.name]).toEqual([4, "invalid_skill"]);
  expect(error.message).toStartWith("dependency `b`: `skills/b` leads out of the repository");
  expect(readdirSync(claude.userRoot)).toEqual([]);
});
