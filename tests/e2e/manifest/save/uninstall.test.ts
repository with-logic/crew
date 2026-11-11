/**
 * `crew uninstall --save` (§9.2): the line is taken out of `.crewrc` and
 * the skills it brought in are removed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { addLocalSkill, crew, installed, makeProject, skillDir } from "../helpers.ts";
import { manifestOf, projectWithTwoSkills } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("crew uninstall --save", () => {
  test("C-RC-55 removes the line from .crewrc and the skill it brought in", () => {
    const home = makeCrewHome();
    const { project, alpha, beta } = projectWithTwoSkills(home);

    const run = crew(home, project, ["uninstall", "--save", beta, "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { unsaved: string[]; removed: { name: string }[] };
    expect(result.unsaved).toEqual([beta]);
    expect(result.removed.map((record) => record.name)).toEqual(["beta"]);
    expect(manifestOf(project)).toBe(`# shared skills\n${alpha}\n`);
    expect(installed(home)).toEqual([`alpha@${project}`]);
    expect(existsSync(skillDir(project, "beta"))).toBe(false);
    expect(readFileSync(join(project, ".crewrc.lock"), "utf8")).not.toContain(beta);
  });

  test("C-RC-55 several references are removed in one run", () => {
    const home = makeCrewHome();
    const { project, alpha, beta } = projectWithTwoSkills(home);

    const run = crew(home, project, ["uninstall", "--save", beta, alpha, "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { unsaved: string[]; removed: { name: string }[] };
    expect(result.unsaved).toEqual([beta, alpha]);
    expect(result.removed.map((record) => record.name).sort()).toEqual(["alpha", "beta"]);
    expect(manifestOf(project)).toBe("# shared skills\n");
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-55 `crew remove --save` is the same command, and says what it removed", () => {
    const home = makeCrewHome();
    const { project, alpha } = projectWithTwoSkills(home);

    const run = crew(home, project, ["remove", "--save", alpha]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`Removed from ${join(project, ".crewrc")}: ${alpha}`);
    expect(run.stdout).toContain("No longer required by .crewrc");
    expect(installed(home)).toEqual([`beta@${project}`]);
  });

  test("C-RC-55 a path given from a subdirectory names the line relative to the manifest", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install"]).code).toBe(0);
    mkdirSync(join(project, "docs"));

    const run = crew(home, join(project, "docs"), ["uninstall", "--save", "../tools/gamma"]);

    expect(run.code).toBe(0);
    expect(manifestOf(project)).toBe("");
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-55 --scope project is accepted, and redundant", () => {
    const home = makeCrewHome();
    const { project, alpha, beta } = projectWithTwoSkills(home);

    const run = crew(home, project, ["uninstall", "--save", "--scope", "project", beta]);

    expect(run.code).toBe(0);
    expect(manifestOf(project)).toBe(`# shared skills\n${alpha}\n`);
    expect(installed(home)).toEqual([`alpha@${project}`]);
  });
});
