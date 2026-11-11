/**
 * `crew uninstall --save` (§9.2): the line is taken out of `.crewrc` and
 * the skills it brought in are removed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

/** A project with `alpha` and `beta` installed from two repositories. */
function projectWithTwoSkills(home: string): { project: string; alpha: string; beta: string } {
  const alpha = makeSkillRepo(["alpha"]);
  const beta = makeSkillRepo(["beta"]);
  const project = makeProject(["# shared skills", alpha, beta]);
  if (crew(home, project, ["install"]).code !== 0) throw new Error("setup install failed");
  return { project, alpha, beta };
}

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

  test("C-RC-56 a reference the manifest does not list is a usage_error and nothing changes", () => {
    const home = makeCrewHome();
    const { project, alpha, beta } = projectWithTwoSkills(home);
    const before = manifestOf(project);

    const run = crew(home, project, ["uninstall", "--save", alpha, "alpha", "--json"]);

    expect(run.code).toBe(4);
    const { error } = JSON.parse(run.stdout) as {
      error: { name: string; details: { refs: string[] } };
    };
    expect(error.name).toBe("usage_error");
    expect(error.details.refs).toEqual(["alpha"]);
    expect(manifestOf(project)).toBe(before);
    expect(installed(home)).toEqual([`alpha@${project}`, `beta@${project}`]);
    expect(beta).not.toBe(alpha);
  });

  test("C-RC-56 a reference that matches no line is redacted wherever the error repeats it", () => {
    const home = makeCrewHome();
    const { project } = projectWithTwoSkills(home);
    const secret = "https://user:hunter2@example.com/acme/skills";

    const json = crew(home, project, ["uninstall", "--save", secret, "--json"]);
    const human = crew(home, project, ["uninstall", "--save", secret]);

    expect(json.code).toBe(4);
    expect(json.stdout).toContain("usage_error");
    expect(json.stdout).not.toContain("hunter2");
    expect(human.stderr).not.toContain("hunter2");
  });

  test("C-RC-56 when the removal that follows aborts, .crewrc and its lockfile are put back", () => {
    const home = makeCrewHome();
    const { project, beta } = projectWithTwoSkills(home);
    const before = manifestOf(project);
    const lockBefore = readFileSync(join(project, ".crewrc.lock"), "utf8");
    expect(lockBefore).toContain(beta);
    // Without its marker the directory is no longer provably crew's (§7.4).
    rmSync(join(skillDir(project, "beta"), ".crew.json"));

    const run = crew(home, project, ["uninstall", "--save", beta]);

    expect(run.code).toBe(1);
    expect(run.stderr).toContain("was left as it was");
    expect(manifestOf(project)).toBe(before);
    expect(readFileSync(join(project, ".crewrc.lock"), "utf8")).toBe(lockBefore);
    expect(existsSync(join(skillDir(project, "beta"), "SKILL.md"))).toBe(true);

    const json = crew(home, project, ["uninstall", "--save", beta, "--json"]);
    expect(json.code).toBe(1);
    expect((JSON.parse(json.stdout) as { unsaved: string[] }).unsaved).toEqual([]);
    expect(manifestOf(project)).toBe(before);
  });

  test.each([
    ["--dry-run", ["--dry-run"]],
    ["--scope user", ["--scope", "user"]],
    ["--all", ["--all"]],
    ["--prune", ["--prune"]],
    ["--agent", ["--agent", "claude-code"]],
  ])("C-RC-57 with %s it is a usage_error and .crewrc is unchanged", (_flag, extra) => {
    const home = makeCrewHome();
    const { project, alpha } = projectWithTwoSkills(home);
    const before = manifestOf(project);

    const run = crew(home, project, ["uninstall", "--save", alpha, ...extra]);

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("usage_error");
    expect(run.stderr).toContain("--save");
    expect(manifestOf(project)).toBe(before);
    expect(installed(home)).toEqual([`alpha@${project}`, `beta@${project}`]);
  });

  test("C-RC-57 with no reference, or with no manifest, it is a usage_error", () => {
    const home = makeCrewHome();
    const { project } = projectWithTwoSkills(home);
    const before = manifestOf(project);

    const noReference = crew(home, project, ["uninstall", "--save"]);
    expect(noReference.code).toBe(4);
    expect(noReference.stderr).toContain("usage_error");
    expect(manifestOf(project)).toBe(before);

    const bare = makeTempDir("crew-proj-");
    const noManifest = crew(home, bare, ["uninstall", "--save", "@acme/skills"]);
    expect(noManifest.code).toBe(4);
    expect(noManifest.stderr).toContain("usage_error");
    expect(noManifest.stderr).toContain("no `.crewrc`");
    expect(existsSync(join(bare, ".crewrc"))).toBe(false);
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
