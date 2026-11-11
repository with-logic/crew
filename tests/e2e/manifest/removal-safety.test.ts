/**
 * What a bare `crew install` refuses to remove (§9.2): a skill something
 * else still needs, a skill whose install directory is really the user's,
 * and anything at all when the manifest could not be satisfied.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  addLocalSkill,
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  ownedNames,
  skillDir,
  writeManifest,
} from "./helpers.ts";

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
    const { records } = JSON.parse(run.stdout) as {
      records: { name: string; perAgent: { error?: { code: string } }[] }[];
    };
    expect(JSON.stringify(records)).toContain("untracked_directory");
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`]);
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

  test("C-RC-30 a project skills directory that is really the user's never costs the user a skill", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    expect(crew(home, makeProject([]), ["install", repo]).code).toBe(0);
    const project = makeProject([repo]);
    mkdirSync(join(project, ".claude"));
    symlinkSync(redirected.userRoot, join(project, ".claude", "skills"));
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, []);
    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { removed: unknown[] }).removed).toEqual([]);
    expect(existsSync(join(redirected.userRoot, "alpha", "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`, "alpha@user"]);
    expect(ownedNames(home)).toEqual([]);
  });

  test("C-RC-30 a project skills directory that is really another project's leaves that project intact", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const other = makeProject([repo]);
    expect(crew(home, other, ["install"]).code).toBe(0);
    const project = makeProject([repo]);
    mkdirSync(join(project, ".claude"));
    symlinkSync(join(other, ".claude", "skills"), join(project, ".claude", "skills"));
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(existsSync(join(skillDir(other, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${other}`, `alpha@${project}`].sort());
    const ownership = readState(home).installations.map((entry) => [
      entry.project_root,
      entry.manifest_owned,
    ]);
    expect(ownership).toContainEqual([other, true]);
    expect(ownership).toContainEqual([project, undefined]);
  });
});
