/**
 * `crew uninstall --scope` targeting (§7.4 "Scope").
 *
 * Covers C-UNINST-15a..c: a selector only ever targets one scope, the
 * cwd picks among project roots, and an "installed elsewhere" miss is
 * `not_installed_here` with a remedy that names where the skill lives.
 *
 * The `--prune` interaction with scope lives in
 * `uninstall-scope-prune.test.ts`; both share `helpers/scoped-install.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import {
  installSkill,
  locationsOf,
  quiet,
  redirectClaudeCode,
  restoreClaudeCode,
} from "../helpers/scoped-install.ts";

let ccUser: string;
let originals: ReturnType<typeof redirectClaudeCode>["originals"];

beforeEach(() => {
  const redirected = redirectClaudeCode();
  ccUser = redirected.userRoot;
  originals = redirected.originals;
});
afterEach(() => {
  restoreClaudeCode(originals);
});

const scopesOf = (home: string) => locationsOf(home, "demo");

describe("uninstall targets one scope", () => {
  test("C-UNINST-15a plain uninstall removes only the user-scope entry", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "user", project)).toBe(0);
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const code = runCli(["uninstall", "demo"], { home, cwd: project, streams: quiet() });
    expect(code).toBe(0);
    expect(scopesOf(home)).toEqual([`project:${project}`]);
    expect(existsSync(join(ccUser, "demo"))).toBe(false);
    expect(existsSync(join(project, ".claude", "skills", "demo"))).toBe(true);
  });

  test("C-UNINST-15b --scope project from one root leaves the other root alone", () => {
    const home = makeCrewHome();
    const projA = makeTempDir("crew-projA-");
    const projB = makeTempDir("crew-projB-");
    expect(installSkill(home, "demo", "user", projA)).toBe(0);
    expect(installSkill(home, "demo", "project", projA)).toBe(0);
    expect(installSkill(home, "demo", "project", projB)).toBe(0);

    const code = runCli(["uninstall", "--scope", "project", "demo"], {
      home,
      cwd: projA,
      streams: quiet(),
    });
    expect(code).toBe(0);
    expect(scopesOf(home)).toEqual([`project:${projB}`, "user"]);
    expect(existsSync(join(projA, ".claude", "skills", "demo"))).toBe(false);
    expect(existsSync(join(projB, ".claude", "skills", "demo"))).toBe(true);
  });

  test("C-UNINST-15 a lone project install is reachable from any cwd", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const code = runCli(["uninstall", "--scope", "project", "demo"], {
      home,
      cwd: makeTempDir("crew-elsewhere-"),
      streams: quiet(),
    });
    expect(code).toBe(0);
    expect(scopesOf(home)).toEqual([]);
    // The fallback must delete at the RECORDED root, not at the cwd the
    // command happened to run from.
    expect(existsSync(join(project, ".claude", "skills", "demo"))).toBe(false);
  });

  test("--scope project with two roots and an unrelated cwd is not_installed_here", () => {
    const home = makeCrewHome();
    const projA = makeTempDir("crew-projA-");
    const projB = makeTempDir("crew-projB-");
    expect(installSkill(home, "demo", "project", projA)).toBe(0);
    expect(installSkill(home, "demo", "project", projB)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--scope", "project", "demo"], {
      home,
      cwd: makeTempDir("crew-elsewhere-"),
      streams: c.streams,
    });
    expect(code).toBe(6);
    expect(c.stderr()).toContain(projA);
    expect(c.stderr()).toContain(projB);
    expect(scopesOf(home)).toHaveLength(2);
    // Both installs survive the refusal, bytes included.
    expect(existsSync(join(projA, ".claude", "skills", "demo"))).toBe(true);
    expect(existsSync(join(projB, ".claude", "skills", "demo"))).toBe(true);

    // The structured payload names every candidate location exactly.
    const j = captureStreams();
    runCli(["uninstall", "--json", "--scope", "project", "demo"], {
      home,
      cwd: makeTempDir("crew-elsewhere-"),
      streams: j.streams,
    });
    const locations = JSON.parse(j.stdout()).error.details.installed_locations;
    expect(locations).toEqual([
      { scope: "project", project_root: projA },
      { scope: "project", project_root: projB },
    ]);
  });
});
