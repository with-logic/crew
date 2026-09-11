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
  });
});

describe("uninstall at a scope where the skill isn't installed", () => {
  test("C-UNINST-15c user-only install + --scope project → not_installed_here with hint", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "user", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--scope", "project", "demo"], {
      home,
      cwd: project,
      streams: c.streams,
    });
    expect(code).toBe(6);
    expect(c.stderr()).toContain("not_installed_here");
    expect(c.stderr()).toContain("installed at user scope");
    expect(c.stderr()).toContain("drop `--scope project`");
    // Nothing was touched.
    expect(scopesOf(home)).toEqual(["user"]);
    expect(existsSync(join(ccUser, "demo"))).toBe(true);
  });

  test("C-UNINST-15c project-only install + plain uninstall → hint names the project root", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--json", "demo"], {
      home,
      cwd: project,
      streams: c.streams,
    });
    expect(code).toBe(6);
    const payload = JSON.parse(c.stdout());
    expect(payload.error.name).toBe("not_installed_here");
    expect(payload.error.details.installed_at).toEqual([
      { scope: "project", project_root: project },
    ]);

    const human = captureStreams();
    runCli(["uninstall", "demo"], { home, cwd: project, streams: human.streams });
    expect(human.stderr()).toContain(`crew uninstall --scope project demo`);
    expect(scopesOf(home)).toEqual([`project:${project}`]);
  });

  test("C-UNINST-15c --force turns the miss into a no-op", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "user", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--force", "--scope", "project", "demo"], {
      home,
      cwd: project,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("nothing to remove");
    expect(scopesOf(home)).toEqual(["user"]);
  });
});

describe("the remedy command survives awkward project paths", () => {
  test("a project root containing spaces is shell-quoted in the hint", () => {
    const home = makeCrewHome();
    const project = join(makeTempDir("crew-proj-"), "my project");
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "demo"], { home, cwd: project, streams: c.streams });
    expect(code).toBe(6);
    // The `cd` target must be pasteable: quoted, not bare.
    expect(c.stderr()).toContain(`cd '${project}'`);
    expect(c.stderr()).not.toContain(`cd ${project} &&`);
  });
});
