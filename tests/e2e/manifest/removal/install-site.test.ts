/**
 * Install sites removal refuses to delete (§9.2): a dropped skill is never
 * removed when its directory is not provably this project's own, and the
 * run says which skill it kept.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readState, writeState } from "../../../../src/state/load.ts";
import { makeCrewHome, withOriginalAdapter } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
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

/** From a `--json` result: the names removed, and the names its warnings say were kept. */
function removedAndKept(stdout: string): { removed: string[]; kept: string[] } {
  const result = JSON.parse(stdout) as { removed: { name: string }[]; warnings?: string[] };
  const kept: string[] = [];
  for (const warning of result.warnings ?? []) {
    const named = /kept `([^`]+)`/.exec(warning);
    if (named?.[1]) kept.push(named[1]);
  }
  return { removed: result.removed.map((record) => record.name), kept };
}

describe("install sites that are not provably the project's own", () => {
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
    expect(removedAndKept(run.stdout)).toEqual({ removed: [], kept: ["alpha"] });
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
    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(0);
    expect(removedAndKept(run.stdout)).toEqual({ removed: [], kept: ["alpha"] });
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
    const run = crew(home, project, ["install", "--force", "--json"]);

    expect(run.code).toBe(0);
    const payload = JSON.parse(run.stdout) as { removed: unknown[]; warnings: string[] };
    expect(payload.removed).toEqual([]);
    expect(payload.warnings.join("\n")).toContain("kept `alpha`");
    expect(existsSync(join(elsewhere, "SKILL.md"))).toBe(true);
    expect(ownedNames(home)).toEqual(["alpha"]);
    expect(crew(home, project, ["install"]).stderr).toContain("kept `alpha`");
  });

  test("C-RC-30 an entry whose recorded name is not a skill name deletes nothing, even with --force", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const victim = `${project}-victim`;
    mkdirSync(victim);
    writeFileSync(join(victim, "keep.txt"), "not crew's\n");
    const state = readState(home);
    const alpha = state.installations.find((entry) => entry.name === "alpha");
    expect(alpha?.manifest_owned).toBe(true);
    const hostile = { ...alpha!, name: `../../../${basename(victim)}` };
    writeState({ ...state, installations: [...state.installations, hostile] }, home);

    const run = crew(home, project, ["install", "--force", "--json"]);

    expect(run.code).toBe(0);
    expect(removedAndKept(run.stdout)).toEqual({
      removed: [],
      kept: [`../../../${basename(victim)}`],
    });
    expect(existsSync(join(victim, "keep.txt"))).toBe(true);
    rmSync(victim, { recursive: true });
  });

  for (const [what, agent] of [
    ["an agent this build does not know", "ghost-agent"],
    ["an agent with no project-scope directory", "nanobot"],
  ] as const) {
    test(`C-RC-30 an entry recorded for ${what} deletes nothing, even with --force`, () => {
      const home = makeCrewHome();
      const project = makeProject([makeSkillRepo(["alpha"])]);
      expect(crew(home, project, ["install"]).code).toBe(0);
      // A same-named directory in the project, which must be left exactly as it is.
      mkdirSync(join(project, "beta"));
      writeFileSync(join(project, "beta", "keep.txt"), "not crew's\n");
      const state = readState(home);
      const alpha = state.installations.find((entry) => entry.name === "alpha");
      expect(alpha?.manifest_owned).toBe(true);
      const odd = { ...alpha!, name: "beta", agents: [agent] };
      writeState({ ...state, installations: [...state.installations, odd] }, home);

      const run = withOriginalAdapter("nanobot", () =>
        crew(home, project, ["install", "--force", "--json"]),
      );

      expect(run.code).toBe(0);
      const payload = JSON.parse(run.stdout) as { removed: unknown[]; warnings: string[] };
      expect(payload.removed).toEqual([]);
      expect(payload.warnings.join("\n")).toContain("kept `beta`");
      expect(existsSync(join(project, "beta", "keep.txt"))).toBe(true);
    });
  }

  test("C-RC-30 an entry that records no agent is kept, with a warning", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const state = readState(home);
    const alpha = state.installations.find((entry) => entry.name === "alpha");
    expect(alpha?.manifest_owned).toBe(true);
    writeState({ ...state, installations: [{ ...alpha!, agents: [] }] }, home);

    writeManifest(project, []);
    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(0);
    expect(run.stderr).toContain("kept `alpha`");
    expect(run.stderr).toContain("could not verify");
    expect(installed(home)).toEqual([`alpha@${project}`]);
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
  });
});
