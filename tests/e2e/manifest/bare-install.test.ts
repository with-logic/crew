/**
 * Bare `crew install` reads the project manifest (§9.2): which file it
 * picks, where the skills land, and what a repeat run does.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
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

const skillFile = (project: string, name: string): string =>
  join(project, ".claude", "skills", name, "SKILL.md");

describe("bare crew install", () => {
  test("C-RC-01 installs every declared skill at project scope under the manifest's directory", () => {
    const home = makeCrewHome();
    const project = makeProject([
      "# shared",
      makeSkillRepo(["alpha", "beta"]),
      "",
      "./tools/gamma",
    ]);
    addLocalSkill(project, "tools", "gamma");

    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(0);
    for (const name of ["alpha", "beta", "gamma"]) {
      expect(existsSync(skillFile(project, name))).toBe(true);
      expect(existsSync(join(redirected.userRoot, name))).toBe(false);
    }
    expect(installed(home)).toEqual([`alpha@${project}`, `beta@${project}`, `gamma@${project}`]);
  });

  test("C-RC-02 from a subdirectory, the nearest manifest above governs and its directory is the project root", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    const nested = join(project, "packages", "api");
    mkdirSync(nested, { recursive: true });

    expect(crew(home, nested, ["install"]).code).toBe(0);

    expect(existsSync(skillFile(project, "gamma"))).toBe(true);
    expect(existsSync(join(nested, ".claude"))).toBe(false);
    expect(installed(home)).toEqual([`gamma@${project}`]);
  });

  test("C-RC-02 with manifests at two levels, the nearest one governs alone", () => {
    const home = makeCrewHome();
    const outer = makeProject(["./tools/gamma"]);
    addLocalSkill(outer, "tools", "gamma");
    const inner = join(outer, "packages", "api");
    addLocalSkill(inner, "tools", "delta");
    writeManifest(inner, ["./tools/delta"]);
    mkdirSync(join(inner, "src"));

    expect(crew(home, join(inner, "src"), ["install"]).code).toBe(0);

    expect(installed(home)).toEqual([`delta@${inner}`]);
    expect(existsSync(skillFile(outer, "gamma"))).toBe(false);
  });

  test("C-RC-03 a repeat run changes nothing and reports the skills as already installed", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    const again = crew(home, project, ["install", "--json"]);

    expect(again.code).toBe(0);
    const payload = JSON.parse(again.stdout) as {
      already_installed: { name: string }[];
      records: unknown[];
      manifest: string;
    };
    expect(payload.already_installed.map((a) => a.name)).toEqual(["alpha"]);
    expect(payload.records).toEqual([]);
    expect(payload.manifest).toBe(join(project, ".crewrc"));
  });

  test("C-RC-04 a manifest that declares nothing installs nothing and succeeds", () => {
    const home = makeCrewHome();
    const project = makeProject(["# nothing yet", ""]);

    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("declares no skills");
    expect(installed(home)).toEqual([]);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  test("C-RC-04 an empty manifest succeeds even with no agent coder on the machine", () => {
    const detect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => false;
    try {
      const run = crew(makeCrewHome(), makeProject([]), ["install", "--json"]);
      expect(run.code).toBe(0);
      expect(JSON.parse(run.stdout)).toMatchObject({ records: [], already_installed: [] });
    } finally {
      (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
    }
  });

  test("C-RC-05 --dry-run reports the declared skills without writing them", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);

    const run = crew(home, project, ["install", "--dry-run"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("alpha");
    expect(existsSync(skillFile(project, "alpha"))).toBe(false);
    // Not merely an empty state file: a dry run writes no state at all.
    expect(existsSync(join(home, "state.json"))).toBe(false);
  });
});
