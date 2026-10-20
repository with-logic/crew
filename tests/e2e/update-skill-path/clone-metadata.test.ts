/**
 * `crew update` never copies crew's own clone metadata (§10.1; C-UPD-40):
 * a skill folder relinked upstream to the repository root — which holds
 * the clone's `.git`, with its remote URL — is `source_gone`, and no
 * `.git` reaches the agent.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("C-UPD-40 a skill folder relinked to the repository root is gone, and copies no .git", () => {
  const home = makeCrewHome();
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  expect(run(home, ["install", "acme/demo"]).code).toBe(0);

  writeFileSync(join(repo, "SKILL.md"), `---\n${skillFrontmatter({ name: "demo" })}\n---\nRoot.\n`);
  rmSync(join(repo, "skills", "demo"), { recursive: true });
  symlinkSync("..", join(repo, "skills", "demo"));
  commitAll(repo, "point demo at the root");

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  const [row] = JSON.parse(r.stdout).rows;
  expect([row.name, row.outcome.kind]).toEqual(["demo", "source_gone"]);
  expect(existsSync(join(claude.userRoot, "demo", ".git"))).toBe(false);
});
