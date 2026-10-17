/**
 * Folder links in tap indexing (§9 step 5 "Folder links", §10.1.1;
 * C-SPEC-17): `crew search`, `<tap>/<skill>` resolution, and re-expansion
 * on `crew update` leave out a folder that leads out of the repository,
 * unread — even one crew could read — and keep one linked inside it.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, gitRepo, link, outsideSkill, searched, skillAt } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** A home with `repo` added as the registered tap `mine`; throws when it can't be added. */
function withTap(repo: string): string {
  const home = makeCrewHome();
  const added = crew(home, ["tap", "add", `file://${repo}`, "mine"]);
  if (added.code !== 0) throw new Error(`crew tap add failed: ${added.out}`);
  return home;
}

test("C-SPEC-17 the tap index leaves out skill and namespace-child folders linked out", () => {
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    skillAt(join(r, "skills", "team"), "x");
    skillAt(join(r, "shared"), "alias");
    link(join("..", "shared", "alias"), join(r, "skills", "alias"));
    link(outsideSkill("evil", true), join(r, "skills", "evil"));
    link(outsideSkill("bad", true), join(r, "skills", "team", "bad"));
  });
  const home = withTap(repo);
  expect(searched(home, "mine")).toEqual({ names: ["alias", "good", "x"], warnings: [] });
  expect(crew(home, ["install", "mine/evil"]).code).not.toBe(0);
  expect(crew(home, ["install", "mine/team/bad"]).code).not.toBe(0);
  expect(readdirSync(claude.userRoot)).toEqual([]);
  expect(crew(home, ["install", "mine/alias"]).code).toBe(0);
  expect(readdirSync(claude.userRoot)).toEqual(["alias"]);
});

test("C-SPEC-17 at a tap's root, the index leaves out a skill folder linked out", () => {
  const repo = gitRepo((r) => {
    skillAt(r, "good");
    link(outsideSkill("evil", true), join(r, "evil"));
  });
  expect(searched(withTap(repo), "mine")).toEqual({ names: ["good"], warnings: [] });
});

test("C-SPEC-17 the tap index never lists a `skills/` linked out, even one crew can't list", () => {
  const outside = makeTempDir("crew-outside-");
  skillAt(outside, "evil");
  const repo = gitRepo((r) => link(outside, join(r, "skills")));
  const home = withTap(repo);
  chmodSync(outside, 0o000);
  try {
    expect(searched(home, "mine")).toEqual({ names: [], warnings: [] });
  } finally {
    chmodSync(outside, 0o755);
  }
});

test("C-SPEC-17 re-expansion on update never installs a new child linked out of the repository", () => {
  const repo = gitRepo((r) => skillAt(join(r, "skills"), "good"));
  const home = withTap(repo);
  expect(crew(home, ["install", "mine"]).code).toBe(0);
  skillAt(join(repo, "shared"), "alias");
  link(join("..", "shared", "alias"), join(repo, "skills", "alias"));
  link(outsideSkill("evil", true), join(repo, "skills", "evil"));
  commitAll(repo, "add alias and evil");

  expect(crew(home, ["update"]).code).toBe(0);
  expect(readdirSync(claude.userRoot).sort()).toEqual(["alias", "good"]);
});
