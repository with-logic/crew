/**
 * `crew uninstall --scope` targeting (§7.4 "Scope").
 *
 * Covers C-UNINST-15a..c: a selector only ever targets one scope, the
 * cwd picks among project roots, and an "installed elsewhere" miss is
 * `not_installed_here` with a remedy that names where the skill lives.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccUser: string;
let originals: { user: () => string; project: (c: string) => string; detect: () => boolean };

beforeEach(() => {
  ccUser = makeTempDir("crew-cc-");
  originals = {
    user: claudeCodeAdapter.userPath,
    project: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

const quiet = () => captureStreams().streams;

function installDemo(home: string, scope: "user" | "project", cwd: string): void {
  const src = makeTempDir("crew-src-");
  const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
  const args = scope === "project" ? ["install", "--scope", "project", skill] : ["install", skill];
  if (runCli(args, { home, cwd, streams: quiet() }) !== 0) throw new Error("install failed");
}

function scopesOf(home: string): string[] {
  return readState(home)
    .installations.filter((e) => e.name === "demo")
    .map((e) => (e.scope === "user" ? "user" : `project:${e.project_root}`))
    .sort();
}

describe("uninstall targets one scope", () => {
  test("C-UNINST-15a plain uninstall removes only the user-scope entry", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    installDemo(home, "user", project);
    installDemo(home, "project", project);

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
    installDemo(home, "user", projA);
    installDemo(home, "project", projA);
    installDemo(home, "project", projB);

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
    installDemo(home, "project", project);

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
    installDemo(home, "project", projA);
    installDemo(home, "project", projB);

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
    installDemo(home, "user", project);

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
    installDemo(home, "project", project);

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
    installDemo(home, "user", project);

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

describe("--prune stays within the targeted scope", () => {
  test("pruning after a project-scope uninstall does not sweep user-scope orphans", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const src = makeTempDir("crew-src-");
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    expect(runCli(["install", join(src, "foo")], { home, cwd: project, streams: quiet() })).toBe(0);
    expect(
      runCli(["install", "--scope", "project", join(src, "foo")], {
        home,
        cwd: project,
        streams: quiet(),
      }),
    ).toBe(0);

    // Remove user-scope foo directly so user-scope bar becomes an orphan.
    expect(runCli(["uninstall", "foo"], { home, cwd: project, streams: quiet() })).toBe(0);

    // Project-scope uninstall with --prune: prunes project bar, not user bar.
    const code = runCli(["uninstall", "--prune", "--scope", "project", "foo"], {
      home,
      cwd: project,
      streams: quiet(),
    });
    expect(code).toBe(0);
    const remaining = readState(home).installations.map((e) => `${e.name}@${e.scope}`);
    expect(remaining).toEqual(["bar@user"]);
  });
});
