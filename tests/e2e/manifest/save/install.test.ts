/**
 * `crew install --save` (§9.2): the reference is added to `.crewrc` and
 * the project is installed from it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  addLocalSkill,
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  ownedNames,
  skillDir,
} from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const manifestOf = (project: string): string => readFileSync(join(project, ".crewrc"), "utf8");

describe("crew install --save", () => {
  test("C-RC-51 adds the reference to .crewrc, installs it, and the manifest owns it", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const beta = makeSkillRepo(["beta"]);
    const project = makeProject(["# shared skills", alpha]);

    const run = crew(home, project, ["install", "--save", beta, "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { saved: string[] }).saved).toEqual([beta]);
    expect(manifestOf(project)).toBe(`# shared skills\n${alpha}\n${beta}\n`);
    expect(installed(home)).toEqual([`alpha@${project}`, `beta@${project}`]);
    expect(ownedNames(home)).toEqual(["alpha", "beta"]);
    expect(readFileSync(join(project, ".crewrc.lock"), "utf8")).toContain(beta);
  });

  test("C-RC-51 with no manifest it starts one where the command ran, and says what it added", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const project = makeTempDir("crew-proj-");

    const run = crew(home, project, ["install", "--save", alpha]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`Added to ${join(project, ".crewrc")}: ${alpha}`);
    expect(manifestOf(project)).toBe(`${alpha}\n`);
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
  });

  test("C-RC-51 --from-git is saved as the git reference it names", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const project = makeProject([]);

    expect(crew(home, project, ["install", "--save", "--from-git", alpha]).code).toBe(0);

    expect(manifestOf(project)).toBe(`${alpha}\n`);
  });

  test("C-RC-51 several references are saved in one run, each once", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const beta = makeSkillRepo(["beta"]);
    const project = makeProject([]);

    const run = crew(home, project, ["install", "--save", alpha, beta, alpha, "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { saved: string[] }).saved).toEqual([alpha, beta]);
    expect(manifestOf(project)).toBe(`${alpha}\n${beta}\n`);
    expect(installed(home)).toEqual([`alpha@${project}`, `beta@${project}`]);

    const again = crew(home, project, ["install", "--save", alpha, beta]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("already lists those references");
    expect(manifestOf(project)).toBe(`${alpha}\n${beta}\n`);
  });

  test("C-RC-52 a path given from a subdirectory is written relative to the manifest", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    addLocalSkill(project, "tools", "gamma");
    mkdirSync(join(project, "docs"));

    const run = crew(home, join(project, "docs"), ["install", "--save", "../tools/gamma"]);

    expect(run.code).toBe(0);
    expect(manifestOf(project)).toBe("./tools/gamma\n");
    expect(existsSync(join(project, "docs", ".crewrc"))).toBe(false);
    expect(installed(home)).toEqual([`gamma@${project}`]);
  });

  test("C-RC-52 a reference already listed is not written again", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const project = makeProject([alpha]);
    writeFileSync(join(project, ".crewrc"), `  ${alpha}`);

    const run = crew(home, project, ["install", "--save", alpha, "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { saved: string[] }).saved).toEqual([]);
    expect(manifestOf(project)).toBe(`  ${alpha}`);
    expect(crew(home, project, ["install", "--save", alpha]).stdout).toContain(
      "already lists that reference",
    );
  });
});
