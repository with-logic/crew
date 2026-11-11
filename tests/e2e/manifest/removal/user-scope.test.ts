/**
 * Install sites that are also a user-scope install (§9.2): a dropped skill
 * is never removed from a directory that is, on disk, some agent's
 * user-scope directory for that skill.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  skillDir,
  writeManifest,
} from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("install sites that are also a user-scope install", () => {
  test("C-RC-23 a project whose install path is the user-scope path itself keeps the user's skill", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    // As for a project rooted at the home directory: one path, both scopes.
    (claudeCodeAdapter as { userPath: () => string }).userPath = () =>
      join(project, ".claude", "skills");
    expect(crew(home, makeProject([]), ["install", repo]).code).toBe(0);
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, []);
    const run = crew(home, project, ["install", "--force", "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { removed: unknown[]; warnings: string[] };
    expect(result.removed).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("kept `alpha`");
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`, "alpha@user"]);
  });

  test("C-RC-23 another agent's user-scope directory, reached by a second path, is recognized", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    // codex's user-scope skills directory is a different path to the very
    // directory claude-code installed this project's skill into.
    const alias = join(makeTempDir("crew-alias-"), "skills");
    symlinkSync(join(project, ".claude", "skills"), alias);
    const codexUserPath = codexAdapter.userPath;
    (codexAdapter as { userPath: () => string }).userPath = () => alias;
    try {
      writeManifest(project, []);
      const run = crew(home, project, ["install", "--force"]);

      expect(run.code).toBe(0);
      expect(run.stderr).toContain("kept `alpha`");
      expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    } finally {
      (codexAdapter as { userPath: () => string }).userPath = codexUserPath;
    }
  });
});
