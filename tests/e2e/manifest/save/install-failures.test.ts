/**
 * `crew install --save` (§9.2): what it refuses, and that a save which
 * does not end in a successful install leaves `.crewrc` as it was.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { addLocalSkill, crew, installed, makeProject, makeSkillRepo } from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const manifestOf = (project: string): string => readFileSync(join(project, ".crewrc"), "utf8");

describe("crew install --save that does not go through", () => {
  test.each([
    ["a skill name from a tap", "python-testing"],
    ["a path outside the project", "../elsewhere/skill"],
    ["an absolute path", "/opt/skills/x"],
    ["a reference with a credential", "https://user:hunter2@example.com/acme/skills"],
    ["a malformed reference", "@acme"],
  ])("C-RC-53 %s is refused before .crewrc is touched", (_what, ref) => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const project = makeProject([alpha]);
    const fresh = makeTempDir("crew-proj-");

    expect(crew(home, project, ["install", "--save", ref]).code).toBe(4);
    expect(manifestOf(project)).toBe(`${alpha}\n`);

    const run = crew(home, fresh, ["install", "--save", ref]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("manifest_invalid");
    expect(run.stderr).not.toContain("hunter2");
    expect(existsSync(join(fresh, ".crewrc"))).toBe(false);
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-53 an absolute path is refused even when it points inside the project", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    addLocalSkill(project, "tools", "gamma");

    const run = crew(home, project, ["install", "--save", join(project, "tools", "gamma")]);

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("manifest_invalid");
    expect(manifestOf(project)).toBe("");
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-53 an unreachable source puts .crewrc back, or removes the one it started", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const project = makeProject([alpha]);
    const fresh = makeTempDir("crew-proj-");
    const missing = `file://${join(makeTempDir("crew-repo-"), "missing")}`;

    const run = crew(home, project, ["install", "--save", missing]);
    expect(run.code).toBe(5);
    expect(run.stderr).toContain("source_unreachable");
    expect(run.stderr).toContain("was left as it was");
    expect(manifestOf(project)).toBe(`${alpha}\n`);

    expect(crew(home, fresh, ["install", "--save", missing]).code).toBe(5);
    expect(existsSync(join(fresh, ".crewrc"))).toBe(false);
  });

  test("C-RC-53 a skill that fails validation puts .crewrc back and says so", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    makeSkill(join(project, "tools"), "broken", "name: broken");

    const run = crew(home, project, ["install", "--save", "./tools/broken"]);

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("was left as it was");
    expect(manifestOf(project)).toBe("");

    const json = crew(home, project, ["install", "--save", "./tools/broken", "--json"]);
    const result = JSON.parse(json.stdout) as { saved: string[]; skipped: { code: string }[] };
    expect(result.saved).toEqual([]);
    expect(JSON.stringify(result.skipped)).toContain("invalid_skill");
    expect(manifestOf(project)).toBe("");
  });

  test.each([
    ["--dry-run", ["--dry-run"]],
    ["--scope user", ["--scope", "user"]],
    ["--recursive", ["--recursive"]],
    ["--latest", ["--latest"]],
  ])("C-RC-54 with %s it is a usage_error and .crewrc is unchanged", (_flag, extra) => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const project = makeProject([]);

    const run = crew(home, project, ["install", "--save", alpha, ...extra]);

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("usage_error");
    expect(manifestOf(project)).toBe("");
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-54 with no reference it is a usage_error and .crewrc is unchanged", () => {
    const project = makeProject(["# nothing yet"]);

    const run = crew(makeCrewHome(), project, ["install", "--save"]);

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("usage_error");
    expect(run.stderr).toContain("--save");
    expect(manifestOf(project)).toBe("# nothing yet\n");
  });
});
