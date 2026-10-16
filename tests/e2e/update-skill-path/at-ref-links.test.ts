/**
 * `crew update` of a skill installed at an `@<ref>` (§9 step 3, §10.1;
 * C-UPD-39, C-UPD-40): the skill is read from a scratch export of the
 * commit, so a symlink on its recorded path makes it gone, and its
 * `SKILL.md` is still never read through a link out of it: that fails the
 * update, as it fails an install (§9 step 4).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { run } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-UPD-40 a SKILL.md relinked out of the repository fails the update at a ref, unread", () => {
  const home = makeCrewHome();
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  expect(run(home, ["install", "acme/demo@main"]).code).toBe(0);

  const outside = makeTempDir();
  writeFileSync(
    join(outside, "SKILL.md"),
    `---\n${skillFrontmatter({ name: "demo" })}\n---\nOUTSIDE\n`,
  );
  rmSync(join(repo, "skills", "demo", "SKILL.md"));
  symlinkSync(join(outside, "SKILL.md"), join(repo, "skills", "demo", "SKILL.md"));
  commitAll(repo, "link SKILL.md out of the repo");

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(1);
  const [row] = JSON.parse(r.stdout).rows;
  expect([row.outcome.kind, row.outcome.error.code]).toEqual(["failed", "invalid_skill"]);
  expect(readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8")).toContain("Original.");
});

test("C-UPD-39 a skill folder relinked at a ref is source_gone, even inside the repository", () => {
  const home = makeCrewHome();
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  expect(run(home, ["install", "acme/demo@main"]).code).toBe(0);

  mkdirSync(join(repo, "shared"));
  renameSync(join(repo, "skills", "demo"), join(repo, "shared", "demo"));
  writeFileSync(join(repo, "shared", "demo", "notes.md"), "Moved.\n");
  symlinkSync(join("..", "shared", "demo"), join(repo, "skills", "demo"));
  commitAll(repo, "move demo behind a link");

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  const rows: { name: string; outcome: { kind: string } }[] = JSON.parse(r.stdout).rows;
  expect(rows.map((row) => `${row.name}:${row.outcome.kind}`)).toEqual(["demo:source_gone"]);
  expect(readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8")).toContain("Original.");
});
