/**
 * Removing dropped skills (§9.2): a skill that leaves the manifest's
 * resolved install set is uninstalled by the next bare `crew install`,
 * and nothing the manifest does not own is touched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  addLocalSkill,
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

describe("removing dropped skills", () => {
  test("C-RC-20 a skill whose line is dropped is uninstalled; the rest stay", () => {
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

  test("C-RC-21 emptying the manifest removes everything it owned, and names each skill", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha", "beta"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, ["# nothing"]);
    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("No longer in .crewrc");
    for (const name of ["alpha", "beta"]) {
      expect(run.stdout).toContain(name);
      expect(existsSync(skillDir(project, name))).toBe(false);
    }
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-22 a skill installed in the project by hand is never removed", () => {
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

  test("C-RC-23 the same skill at user scope or in another project is untouched", () => {
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
    expect(existsSync(skillDir(other, "alpha"))).toBe(true);
  });

  test("C-RC-24 --dry-run lists what would be removed and changes neither state nor config", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, []);
    const before = { state: readState(home), config: readConfig(home) };

    const run = crew(home, project, ["install", "--dry-run", "--json"]);

    expect(run.code).toBe(0);
    const payload = JSON.parse(run.stdout) as { removed: { name: string }[] };
    expect(payload.removed.map((r) => r.name)).toEqual(["alpha"]);
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect({ state: readState(home), config: readConfig(home) }).toEqual(before);
  });

  test("C-RC-24 --dry-run with skills still declared names the removal in human output too", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"]), "./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, ["./tools/gamma"]);

    const run = crew(home, project, ["install", "--dry-run"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("No longer in .crewrc");
    expect(run.stdout).toContain("alpha");
    expect(installed(home)).toEqual([`alpha@${project}`, `gamma@${project}`]);
  });

  test("C-RC-21 an emptied manifest removes what it owned even with no agent coder active", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, []);
    const detect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => false;
    try {
      expect(crew(home, project, ["install"]).code).toBe(0);
    } finally {
      (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
    }
    expect(installed(home)).toEqual([]);
    expect(existsSync(skillDir(project, "alpha"))).toBe(false);
  });
});
