/**
 * Manifest ownership (§9.2): a skill dropped from `.crewrc` is removed by
 * the next bare `crew install`, and a skill the manifest never declared
 * is left alone.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  addLocalSkill,
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  writeManifest,
} from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const skillDir = (project: string, name: string): string =>
  join(project, ".claude", "skills", name);

describe("manifest ownership", () => {
  test("C-RC-13 a skill whose line is dropped is uninstalled; the rest stay", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo, "./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, ["./tools/gamma"]);
    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(0);
    const payload = JSON.parse(run.stdout) as { removed: { name: string }[] };
    expect(payload.removed.map((r) => r.name)).toEqual(["alpha"]);
    expect(existsSync(skillDir(project, "alpha"))).toBe(false);
    expect(installed(home)).toEqual([`gamma@${project}`]);
    // The dropped line was the only use of its auto tap (§16.5).
    expect(readConfig(home).taps.some((tap) => tap.url === repo)).toBe(false);
  });

  test("C-RC-14 emptying the manifest removes everything it owned, and says so", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha", "beta"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, ["# nothing"]);
    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("No longer in .crewrc");
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-15 a skill installed in the project by hand is never removed", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    addLocalSkill(project, "tools", "mine");
    expect(crew(home, project, ["install", "--scope", "project", "./tools/mine"]).code).toBe(0);

    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(installed(home)).toEqual([`mine@${project}`]);
    expect(existsSync(skillDir(project, "mine"))).toBe(true);
  });

  test("C-RC-16 a hand-installed skill the manifest later declares becomes the manifest's", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install", "--scope", "project", "./tools/gamma"]).code).toBe(0);

    writeManifest(project, ["./tools/gamma"]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(readState(home).installations[0]?.manifest).toBe(true);

    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-17 the same skill at user scope or in another project is untouched", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    const other = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(crew(home, other, ["install"]).code).toBe(0);
    expect(crew(home, project, ["install", repo]).code).toBe(0);

    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(installed(home)).toEqual([`alpha@${other}`, "alpha@user"]);
    expect(existsSync(join(redirected.userRoot, "alpha", "SKILL.md"))).toBe(true);
  });
});
