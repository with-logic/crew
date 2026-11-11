/**
 * Removal fail-safes (§9.2): a removal that aborts on an uninstall safety
 * check, and the ways an install can fail without costing the project a
 * skill it already has.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  addLocalSkill,
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  ownedNames,
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

describe("removal safety", () => {
  test("C-RC-25 a removal that aborts on a safety check keeps the skill, reports it, exit 1", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    // Without its marker the directory is no longer provably crew's (§7.4).
    rmSync(join(skillDir(project, "alpha"), ".crew.json"));
    writeManifest(project, []);

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(1);
    const { removed } = JSON.parse(run.stdout) as {
      removed: { name: string; failures: { error: { code: string } }[] }[];
    };
    expect(removed.map((r) => [r.name, r.failures[0]?.error.code])).toEqual([
      ["alpha", "untracked_directory"],
    ]);
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`]);
  });

  test("C-RC-25 an aborted removal also fails an install that otherwise succeeded", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"]), "./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install"]).code).toBe(0);
    rmSync(join(skillDir(project, "alpha"), ".crew.json"));
    writeManifest(project, ["./tools/gamma"]);

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(1);
    const { removed } = JSON.parse(run.stdout) as { removed: { name: string }[] };
    expect(removed.map((r) => r.name)).toEqual(["alpha"]);
    expect(installed(home)).toEqual([`alpha@${project}`, `gamma@${project}`]);
  });

  test("C-RC-27 when a declared skill cannot be installed into its directory, a dropped skill stays", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    addLocalSkill(project, "tools", "gamma");
    // Something other than crew already occupies gamma's destination (§7.3).
    mkdirSync(skillDir(project, "gamma"), { recursive: true });
    writeManifest(project, ["./tools/gamma"]);

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(1);
    const { records } = JSON.parse(run.stdout) as { records: unknown[] };
    expect(JSON.stringify(records)).toContain("untracked_directory");
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`]);
    expect(ownedNames(home)).toEqual(["alpha"]);
  });

  test("C-RC-27 when one skill of a declared source fails validation, a dropped skill stays", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    addLocalSkill(project, "tools", "gamma");
    makeSkill(join(project, "tools"), "broken", "name: broken");
    writeManifest(project, ["./tools"]);

    expect(crew(home, project, ["install"]).code).toBe(1);

    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`, `gamma@${project}`]);
    // alpha is still the manifest's to remove later; gamma was never claimed.
    expect(ownedNames(home)).toEqual(["alpha"]);
  });

  test("C-RC-27 when the manifest cannot be satisfied, nothing is removed", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(join(home, "state.json"), "utf8");

    writeManifest(project, ["./tools/missing"]);
    const missing = crew(home, project, ["install"]);
    expect(missing.code).toBe(4);
    expect(missing.stderr).toContain("no_skills_found");

    writeManifest(project, ["python-testing"]);
    const invalid = crew(home, project, ["install"]);
    expect(invalid.code).toBe(4);
    expect(invalid.stderr).toContain("manifest_invalid");

    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
  });

  test("C-RC-25 --force removes a dropped skill whose safety check would have aborted", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    rmSync(join(skillDir(project, "alpha"), ".crew.json"));
    writeManifest(project, []);

    expect(crew(home, project, ["install", "--force"]).code).toBe(0);

    expect(existsSync(skillDir(project, "alpha"))).toBe(false);
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-25 under --quiet an aborted removal is still explained on stderr", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    rmSync(join(skillDir(project, "alpha"), ".crew.json"));
    writeManifest(project, []);

    const run = crew(home, project, ["install", "--quiet"]);

    expect(run.code).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("could not remove `alpha`");
    expect(run.stderr).toContain("untracked_directory");
    expect(run.stderr).toContain("--force");
  });

  test("C-RC-27 when a declared source cannot be reached, a dropped skill stays and stays owned", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, [`file://${join(project, "no-such-repo")}`]);

    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(5);
    expect(run.stderr).toContain("source_unreachable");
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(ownedNames(home)).toEqual(["alpha"]);
  });

  test("C-RC-25 one skill that cannot be removed does not hold back an unrelated one", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"]), makeSkillRepo(["beta"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    rmSync(join(skillDir(project, "alpha"), ".crew.json"));
    writeManifest(project, []);

    expect(crew(home, project, ["install"]).code).toBe(1);

    expect(installed(home)).toEqual([`alpha@${project}`]);
    expect(existsSync(skillDir(project, "beta"))).toBe(false);
  });
});
