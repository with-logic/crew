/**
 * Manifest ownership safety (§9.2): what a bare `crew install` refuses to
 * remove, and that ownership outlives an update.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, installed, makeProject, makeSkillRepo, writeManifest } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const skillFile = (project: string, name: string): string =>
  join(project, ".claude", "skills", name, "SKILL.md");

describe("manifest ownership safety", () => {
  test("C-RC-18 --dry-run names what would be removed and removes nothing", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, []);

    const run = crew(home, project, ["install", "--dry-run", "--json"]);

    expect(run.code).toBe(0);
    const payload = JSON.parse(run.stdout) as { removed: { name: string }[] };
    expect(payload.removed.map((r) => r.name)).toEqual(["alpha"]);
    expect(existsSync(skillFile(project, "alpha"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`]);
  });

  test("C-RC-19 a dropped skill whose install site fails uninstall's safety checks is kept, exit 1", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    // Without its marker the directory is no longer provably crew's (§7.4).
    rmSync(join(project, ".claude", "skills", "alpha", ".crew.json"));
    writeManifest(project, []);

    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(1);
    expect(run.stdout).toContain("alpha");
    expect(existsSync(skillFile(project, "alpha"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`]);
  });

  test("C-RC-20 when a declared line fails, nothing is removed", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    writeManifest(project, ["./tools/missing"]);

    const run = crew(home, project, ["install"]);

    expect(run.code).not.toBe(0);
    expect(existsSync(skillFile(project, "alpha"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`]);
  });

  test("C-RC-21 ownership survives crew update, so a later drop still removes the skill", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const repoDir = repo.slice("file://".length);
    writeFileSync(join(repoDir, "alpha", "notes.md"), "v2\n");
    commitAll(repoDir, "v2");

    expect(crew(home, project, ["update"]).code).toBe(0);
    expect(existsSync(join(project, ".claude", "skills", "alpha", "notes.md"))).toBe(true);
    expect(readState(home).installations[0]?.manifest).toBe(true);

    writeManifest(project, []);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(installed(home)).toEqual([]);
  });
});
