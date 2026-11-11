/**
 * Linked install directories (§9.2): a dropped skill whose directory is
 * reached through a symbolic link is never removed, because the directory
 * may be somebody else's.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
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

describe("linked install directories", () => {
  test("C-RC-30 a project skills directory that is a link to the user's never costs the user a skill", () => {
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
  });

  test("C-RC-30 a project skills directory that is a link to another project's leaves that project intact", () => {
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
  });

  test("C-RC-30 a linked skill directory is never removed, whoever else may use it", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    // Nothing in this crew home records the link's target: it could belong to anyone.
    const elsewhere = join(makeTempDir("crew-elsewhere-"), "alpha");
    renameSync(skillDir(project, "alpha"), elsewhere);
    symlinkSync(elsewhere, skillDir(project, "alpha"));

    writeManifest(project, []);
    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { removed: unknown[] }).removed).toEqual([]);
    expect(existsSync(join(elsewhere, "SKILL.md"))).toBe(true);
    expect(ownedNames(home)).toEqual(["alpha"]);
  });

  test("C-RC-30 a project whose install path is the user-scope path itself keeps the user's skill", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    // As for a project rooted at the home directory: one path, both scopes.
    (claudeCodeAdapter as { userPath: () => string }).userPath = () =>
      join(project, ".claude", "skills");
    expect(crew(home, makeProject([]), ["install", repo]).code).toBe(0);
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, []);
    const run = crew(home, project, ["install", "--force", "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { removed: unknown[] }).removed).toEqual([]);
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(installed(home)).toEqual([`alpha@${project}`, "alpha@user"]);
  });

  test("C-RC-30 an entry whose recorded name is not a skill name deletes nothing, even with --force", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const victim = `${project}-victim`;
    mkdirSync(victim);
    writeFileSync(join(victim, "keep.txt"), "not crew's\n");
    const state = readState(home);
    const hostile = { ...state.installations[0]!, name: `../../../${basename(victim)}` };
    writeState({ ...state, installations: [...state.installations, hostile] }, home);

    const run = crew(home, project, ["install", "--force", "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { removed: unknown[] }).removed).toEqual([]);
    expect(existsSync(join(victim, "keep.txt"))).toBe(true);
    rmSync(victim, { recursive: true });
  });
});
