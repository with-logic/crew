/**
 * Folder links at install (§9 step 5 "Folder links"; C-SPEC-17): in a git
 * source, a skill folder, a namespace, or `skills/` itself may be a link
 * that stays inside the repository; one that leads out of it, or to its
 * root or `.git`, is an `invalid_skill` candidate, never read, while the
 * source's other skills install. A path source isn't held to this.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, gitRepo, link, outsideSkill, skillAt, storedNames } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** The skills installed into claude-code. */
function installed(): string[] {
  return readdirSync(claude.userRoot).sort();
}

const OUT = "leads out of the repository through a link";

test("C-SPEC-17 a skill folder linked out of the repository is invalid, never read; the rest install", () => {
  const evil = outsideSkill("evil");
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    link(evil, join(r, "skills", "evil"));
  });
  const home = makeCrewHome();
  const r = crew(home, ["install", `file://${repo}`]);
  expect(r.code).toBe(1);
  expect(installed()).toEqual(["good"]);
  expect(r.out).toContain(`\`skills/evil\` ${OUT}`);
  expect(storedNames(home)).toEqual(["good"]);
});

test("C-SPEC-17 a namespace linked out is refused as one candidate, never listed", () => {
  const team = join(makeTempDir("crew-outside-"), "team");
  skillAt(team, "x");
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    link(team, join(r, "skills", "team"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  expect(r.code).toBe(1);
  expect(installed()).toEqual(["good"]);
  expect(r.out).toContain(`\`skills/team\` ${OUT}`);
  expect(r.out).not.toContain("team/x");
});

test("C-SPEC-17 a `skills/` linked out of the repository is one invalid candidate, never listed", () => {
  const outside = join(outsideSkill("evil"), "..");
  const repo = gitRepo((r) => {
    writeFileSync(join(r, "README.md"), "hello\n");
    link(outside, join(r, "skills"));
  });
  // Listing it would fail: crew can't search it.
  chmodSync(outside, 0o000);
  let r: ReturnType<typeof crew>;
  try {
    r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  } finally {
    chmodSync(outside, 0o755);
  }
  expect(r.code).toBe(4);
  expect(installed()).toEqual([]);
  expect(r.out).toContain(`\`skills\` ${OUT}`);
});

test("C-SPEC-17 links that stay inside the repository are followed", () => {
  const repo = gitRepo((r) => {
    skillAt(join(r, "shared"), "alias");
    skillAt(join(r, "teams", "team"), "y");
    link(join("..", "shared", "alias"), join(r, "skills", "alias"));
    link(join("..", "teams", "team"), join(r, "skills", "team"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  expect(r.code).toBe(0);
  expect(installed()).toEqual(["alias", "y"]);
  const body = readFileSync(join(claude.userRoot, "alias", "SKILL.md"), "utf8");
  expect(body).toContain("name: alias");
});

test("C-SPEC-17 a folder linked to the repository's root or its .git is refused", () => {
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    link("..", join(r, "skills", "up"));
    link(join("..", ".git"), join(r, "skills", "meta"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  expect(r.code).toBe(1);
  expect(installed()).toEqual(["good"]);
  expect(r.out).toContain(`\`skills/up\` ${OUT}`);
  expect(r.out).toContain(`\`skills/meta\` ${OUT}`);
});

test("C-SPEC-17 at the root, a link out is a candidate only when it holds a SKILL.md", () => {
  const evil = outsideSkill("evil");
  const docs = makeTempDir("crew-outside-");
  writeFileSync(join(docs, "notes.md"), "notes\n");
  const repo = gitRepo((r) => {
    skillAt(r, "good");
    link(evil, join(r, "evil"));
    link(docs, join(r, "docs"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  expect(r.code).toBe(1);
  expect(installed()).toEqual(["good"]);
  expect(r.out).toContain(`\`evil\` ${OUT}`);
  expect(r.out).not.toContain("docs");
});

test("C-SPEC-17 a commit read at a ref is held to its own export", () => {
  const evil = outsideSkill("evil");
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    link(evil, join(r, "skills", "evil"));
  });
  tagRepo(repo, "v1");
  const r = crew(makeCrewHome(), ["install", `file://${repo}@v1`]);
  expect(r.code).toBe(1);
  expect(installed()).toEqual(["good"]);
  expect(r.out).toContain(`\`skills/evil\` ${OUT}`);
});

for (const at of ["", "@v1"]) {
  test(`C-SPEC-17 a repository whose root is the skill is no link out of itself${at && " (at a ref)"}`, () => {
    const repo = gitRepo((r) =>
      writeFileSync(
        join(r, "SKILL.md"),
        readFileSync(join(skillAt(makeTempDir(), "whole"), "SKILL.md")),
      ),
    );
    tagRepo(repo, "v1");
    expect(crew(makeCrewHome(), ["install", `file://${repo}${at}`]).code).toBe(0);
    expect(installed()).toEqual(["whole"]);
  });
}

test("C-SPEC-17 a path source is the user's own directory, not held to it", () => {
  const linked = outsideSkill("linked", true);
  const src = makeTempDir("crew-src-");
  skillAt(join(src, "skills"), "good");
  link(linked, join(src, "skills", "linked"));
  const r = crew(makeCrewHome(), ["install", src]);
  expect(r.code).toBe(0);
  expect(installed()).toEqual(["good", "linked"]);
});
