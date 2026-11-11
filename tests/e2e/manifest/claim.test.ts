/**
 * Manifest ownership (§9.2, §11.1): which state entries a bare
 * `crew install` marks `manifest: true`, and which it leaves alone.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { addLocalSkill, crew, makeProject, makeSkillRepo, writeManifest } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** `name@location` for every manifest-owned entry, sorted. */
function owned(home: string): string[] {
  return readState(home)
    .installations.filter((entry) => entry.manifest === true)
    .map((entry) => `${entry.name}@${entry.project_root ?? "user"}`)
    .sort();
}

describe("manifest ownership", () => {
  test("C-RC-13 every skill the manifest resolves to is owned, dependencies included", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"]), "./tools/top"]);
    addLocalSkill(project, "tools", "base");
    makeSkill(
      join(project, "tools"),
      "top",
      skillFrontmatter({ name: "top", dependencies: ["base"] }),
    );

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(owned(home)).toEqual([`alpha@${project}`, `base@${project}`, `top@${project}`]);
  });

  test("C-RC-14 skills the manifest does not resolve to are not owned, wherever they are", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    const other = makeProject([]);
    addLocalSkill(project, "tools", "mine");
    expect(crew(home, project, ["install", "--scope", "project", "./tools/mine"]).code).toBe(0);
    expect(crew(home, project, ["install", repo]).code).toBe(0);
    expect(crew(home, other, ["install", "--scope", "project", repo]).code).toBe(0);

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(owned(home)).toEqual([`alpha@${project}`]);
  });

  test("C-RC-15 a skill installed by hand becomes owned once the manifest declares it", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install", "--scope", "project", "./tools/gamma"]).code).toBe(0);
    expect(owned(home)).toEqual([]);

    writeManifest(project, ["./tools/gamma"]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(owned(home)).toEqual([`gamma@${project}`]);
  });

  test("C-RC-16 nothing is claimed when a declared reference fails, or on a dry run", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma", "./tools/absent"]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install", "--scope", "project", "./tools/gamma"]).code).toBe(0);

    expect(crew(home, project, ["install"]).code).toBe(4);
    expect(owned(home)).toEqual([]);

    writeManifest(project, ["./tools/gamma"]);
    expect(crew(home, project, ["install", "--dry-run"]).code).toBe(0);
    expect(owned(home)).toEqual([]);
  });

  test("C-RC-17 a repeat install with nothing new to claim does not rewrite state", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(join(home, "state.json"), "utf8");

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
  });

  test("C-RC-18 ownership survives crew update, and a skill the update adds from an owned source is owned", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const repoDir = repo.slice("file://".length);
    writeFileSync(join(repoDir, "alpha", "notes.md"), "v2\n");
    makeSkill(repoDir, "beta", skillFrontmatter({ name: "beta" }));
    commitAll(repoDir, "v2 adds beta");

    expect(crew(home, project, ["update"]).code).toBe(0);

    expect(owned(home)).toEqual([`alpha@${project}`, `beta@${project}`]);
  });

  test("C-RC-19 a skill an update adds from a source no manifest owns is not owned", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([]);
    expect(crew(home, project, ["install", "--scope", "project", repo]).code).toBe(0);
    const repoDir = repo.slice("file://".length);
    makeSkill(repoDir, "beta", skillFrontmatter({ name: "beta" }));
    commitAll(repoDir, "adds beta");

    expect(crew(home, project, ["update"]).code).toBe(0);

    expect(
      readState(home)
        .installations.map((entry) => entry.name)
        .sort(),
    ).toEqual(["alpha", "beta"]);
    expect(owned(home)).toEqual([]);
  });
});
