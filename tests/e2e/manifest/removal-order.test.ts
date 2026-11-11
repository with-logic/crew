/**
 * Removal order (§9.2): dependents go before what they depend on, a skill
 * something surviving still needs is kept, and a dropped chain or cycle
 * nothing else needs is removed in full.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, installed, makeProject, ownedNames, skillDir, writeManifest } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** Skills under `<project>/tools`; each maps to the one skill it depends on, or null. */
function addSkillsWithDependencies(
  project: string,
  dependenciesBySkill: Record<string, string | null>,
): void {
  mkdirSync(join(project, "tools"), { recursive: true });
  for (const [name, dependency] of Object.entries(dependenciesBySkill)) {
    const dependencies = dependency === null ? [] : [dependency];
    makeSkill(join(project, "tools"), name, skillFrontmatter({ name, dependencies }));
  }
}

/** Empty the manifest, run a bare install, and return the names it reports removed. */
function dropEverything(home: string, project: string): { code: number; removed: string[] } {
  writeManifest(project, []);
  const run = crew(home, project, ["install", "--json"]);
  const { removed } = JSON.parse(run.stdout) as { removed: { name: string }[] };
  return { code: run.code, removed: removed.map((record) => record.name) };
}

describe("removal order", () => {
  test("C-RC-28 skills a hand-installed skill still needs are kept and released, down the chain", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/top"]);
    addSkillsWithDependencies(project, {
      base: null,
      middle: "base",
      top: "middle",
      mine: "middle",
    });
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
    addSkillsWithDependencies(project, { base: null, top: "base" });
    expect(crew(home, project, ["install"]).code).toBe(0);
    rmSync(join(skillDir(project, "top"), ".crew.json"));

    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(1);

    expect(installed(home)).toEqual([`base@${project}`, `top@${project}`]);
    expect(existsSync(join(skillDir(project, "base"), "SKILL.md"))).toBe(true);
    expect(ownedNames(home)).toEqual(["base", "top"]);
  });

  test("C-RC-35 a dropped chain nothing else needs is removed in full, dependents first", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/top"]);
    addSkillsWithDependencies(project, { base: null, middle: "base", top: "middle" });
    expect(crew(home, project, ["install"]).code).toBe(0);

    const run = dropEverything(home, project);

    expect(run).toEqual({ code: 0, removed: ["top", "middle", "base"] });
    expect(installed(home)).toEqual([]);
    for (const name of ["top", "middle", "base"]) {
      expect(existsSync(skillDir(project, name))).toBe(false);
    }
  });

  test("C-RC-35 a dropped dependency cycle nothing else needs is removed in full", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/ping"]);
    addSkillsWithDependencies(project, { ping: "pong", pong: "ping" });
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(ownedNames(home)).toEqual(["ping", "pong"]);

    const run = dropEverything(home, project);

    expect(run.code).toBe(0);
    expect(run.removed.sort()).toEqual(["ping", "pong"]);
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-28 a cycle that a hand-installed skill needs is kept whole and released", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/ping"]);
    addSkillsWithDependencies(project, { ping: "pong", pong: "ping", mine: "ping" });
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(crew(home, project, ["install", "--scope", "project", "./tools/mine"]).code).toBe(0);

    const run = dropEverything(home, project);

    expect(run).toEqual({ code: 0, removed: [] });
    expect(installed(home)).toEqual([`mine@${project}`, `ping@${project}`, `pong@${project}`]);
    expect(ownedNames(home)).toEqual([]);
  });
});
