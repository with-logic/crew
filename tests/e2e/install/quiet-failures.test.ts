/**
 * `crew install --quiet` (§5.2, §9 step 11): the summary is suppressed, so
 * a failed skill is explained on stderr. Real projects, real skill
 * directories, a real local git repository.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { addLocalSkill, crew, makeProject, makeSkillRepo, skillDir } from "../manifest/helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** A project whose skills directory already holds an `alpha` crew did not install. */
function projectWithUntrackedAlpha(): string {
  const project = makeProject([]);
  mkdirSync(skillDir(project, "alpha"), { recursive: true });
  writeFileSync(join(skillDir(project, "alpha"), "notes.md"), "mine\n");
  return project;
}

describe("crew install --quiet", () => {
  test("C-INST-25 a skill that fails validation is named on stderr with its code and message", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    makeSkill(project, "broken", "name: broken");
    const args = ["install", "--scope", "project", "./broken"];

    const quiet = crew(home, project, [...args, "--quiet"]);

    expect(quiet.code).toBe(4);
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toContain(join(project, "broken"));
    expect(quiet.stderr).toContain("failed (invalid_skill): ");

    // Without --quiet the summary carries the reason, and stderr does not repeat it.
    const normal = crew(home, project, args);
    expect(normal.code).toBe(4);
    expect(normal.stderr).not.toContain("failed (invalid_skill)");
  });

  test("C-INST-25 an agent a skill could not be installed into is named on stderr", () => {
    const home = makeCrewHome();
    const project = projectWithUntrackedAlpha();
    const args = ["install", "--scope", "project", makeSkillRepo(["alpha"])];

    const quiet = crew(home, project, [...args, "--quiet"]);

    expect(quiet.code).toBe(1);
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toContain("alpha: claude-code: failed (untracked_directory): ");

    expect(crew(home, project, args).stderr).not.toContain("failed (untracked_directory)");
  });

  test("C-INST-25 a quiet install in which nothing failed prints nothing", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    addLocalSkill(project, "skills", "alpha");

    const run = crew(home, project, ["install", "--scope", "project", "./skills/alpha", "--quiet"]);

    expect(run).toEqual({ code: 0, stdout: "", stderr: "" });
  });
});
