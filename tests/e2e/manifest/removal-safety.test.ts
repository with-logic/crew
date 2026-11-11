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
import { makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, installed, makeProject, makeSkillRepo, writeManifest } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const skillDir = (project: string, name: string): string =>
  join(project, ".claude", "skills", name);

/** Skills under `<project>/tools`, each depending on the one named after it. */
function addChain(project: string, chain: Record<string, string | null>): void {
  mkdirSync(join(project, "tools"), { recursive: true });
  for (const [name, dependency] of Object.entries(chain)) {
    const dependencies = dependency === null ? [] : [dependency];
    makeSkill(join(project, "tools"), name, skillFrontmatter({ name, dependencies }));
  }
}

const ownedNames = (home: string): string[] =>
  readState(home)
    .installations.filter((entry) => entry.manifest_owned === true)
    .map((entry) => entry.name)
    .sort();

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

  test("C-RC-28 skills a hand-installed skill still needs are kept and released, down the chain", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/top"]);
    addChain(project, { base: null, middle: "base", top: "middle", mine: "middle" });
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(ownedNames(home)).toEqual(["base", "middle", "top"]);
    expect(crew(home, project, ["install", "--scope", "project", "./tools/mine"]).code).toBe(0);

    writeManifest(project, []);
    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(0);
    const { removed } = JSON.parse(run.stdout) as { removed: { name: string }[] };
    expect(removed.map((r) => r.name)).toEqual(["top"]);
    expect(installed(home)).toEqual([`base@${project}`, `middle@${project}`, `mine@${project}`]);
    expect(ownedNames(home)).toEqual([]);
  });

  test("C-RC-29 when a dependent's removal aborts, its dependency stays and stays owned", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/top"]);
    addChain(project, { base: null, top: "base" });
    expect(crew(home, project, ["install"]).code).toBe(0);
    rmSync(join(skillDir(project, "top"), ".crew.json"));

    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(1);

    expect(installed(home)).toEqual([`base@${project}`, `top@${project}`]);
    expect(existsSync(join(skillDir(project, "base"), "SKILL.md"))).toBe(true);
    expect(ownedNames(home)).toEqual(["base", "top"]);
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
    expect(installed(home)).toContain("alpha@user");
    expect(ownedNames(home)).toEqual([]);
  });
});
