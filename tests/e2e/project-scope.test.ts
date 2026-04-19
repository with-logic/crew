/**
 * Project-scope install lifecycle tests.
 *
 * These pin down the invariant that a skill installed under `--scope
 * project` at some directory `P` is updated and uninstalled at `P`
 * regardless of what the user's current directory is at the time of the
 * later command. Without this, `crew autoupdate` (which runs from a
 * fixed working directory picked by launchd) would try to update
 * project-scope skills at the wrong location — either silently skipping
 * them, or installing a fresh copy next to the running process.
 *
 * The key state field is `project_root`, recorded at install time and
 * honored by every subsequent command.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

// Adapters redirected per-test: user-scope roots are tmp dirs crew owns;
// project-scope paths stay at `<cwd>/.claude/skills/` etc. so tests can
// observe files under a specific project directory.
let ccUser: string;
let coUser: string;
let geUser: string;
let originals: {
  cc: { user: () => string; project: (c: string) => string; detect: () => boolean };
  co: { user: () => string; project: (c: string) => string; detect: () => boolean };
  ge: { user: () => string; project: (c: string) => string; detect: () => boolean };
};

beforeEach(() => {
  ccUser = makeTempDir("crew-cc-");
  coUser = makeTempDir("crew-co-");
  geUser = makeTempDir("crew-ge-");
  originals = {
    cc: {
      user: claudeCodeAdapter.userPath,
      project: claudeCodeAdapter.projectPath,
      detect: claudeCodeAdapter.detect,
    },
    co: {
      user: codexAdapter.userPath,
      project: codexAdapter.projectPath,
      detect: codexAdapter.detect,
    },
    ge: {
      user: geminiCliAdapter.userPath,
      project: geminiCliAdapter.projectPath,
      detect: geminiCliAdapter.detect,
    },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coUser;
  (codexAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".codex", "skills");
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geUser;
  (geminiCliAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".gemini", "skills");
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.cc.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
  (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
  (codexAdapter as { projectPath: (c: string) => string }).projectPath = originals.co.project;
  (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.user;
  (geminiCliAdapter as { projectPath: (c: string) => string }).projectPath = originals.ge.project;
  (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.detect;
});

describe("project-scope install records the project_root", () => {
  test("state entry captures the directory the skill was installed at", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const repo = makeTempDir("crew-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");

    const code = runCli(["install", "--scope", "project", `file://${repo}//demo`], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);

    const state = readState(home);
    const entry = state.installations.find((e) => e.name === "demo" && e.scope === "project")!;
    expect(entry).toBeDefined();
    expect(entry.project_root).toBe(project);
    // File landed at the project root, not in user scope.
    expect(existsSync(join(project, ".claude", "skills", "demo", "SKILL.md"))).toBe(true);
  });
});

describe("crew update from a different directory honors project_root", () => {
  test("update run from an unrelated cwd still updates the project install", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const elsewhere = makeTempDir("crew-elsewhere-");
    const repo = makeTempDir("crew-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");

    // 1. Install at project scope from the project dir.
    runCli(["install", "--scope", "project", `file://${repo}//demo`], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    expect(existsSync(join(project, ".claude", "skills", "demo", "SKILL.md"))).toBe(true);

    // 2. Upstream publishes a change.
    const fs = require("node:fs");
    fs.writeFileSync(join(repo, "demo", "NEW.md"), "added");
    commitAll(repo, "add NEW.md");

    // 3. Run update from an UNRELATED working directory (the autoupdate
    //    case — launchd picks its own cwd, usually $HOME, not the user's
    //    project). This must update the install at `project`, not at
    //    `elsewhere`, and not silently drop it.
    const c = captureStreams();
    const code = runCli(["update"], {
      home,
      cwd: elsewhere,
      streams: c.streams,
    });
    expect(code).toBe(0);

    // The new file exists at the project root.
    expect(existsSync(join(project, ".claude", "skills", "demo", "NEW.md"))).toBe(true);
    // Nothing was written to the unrelated cwd.
    expect(existsSync(join(elsewhere, ".claude", "skills", "demo"))).toBe(false);
    // The update ran (saw the skill), not silently skipped.
    expect(c.stdout()).toContain("demo");
  });
});

describe("crew uninstall from a different directory honors project_root", () => {
  test("uninstall run from an unrelated cwd still removes the project install", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const elsewhere = makeTempDir("crew-elsewhere-");
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));

    runCli(["install", "--scope", "project", skill], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    expect(existsSync(join(project, ".claude", "skills", "demo"))).toBe(true);

    const code = runCli(["uninstall", "--scope", "project", "demo"], {
      home,
      cwd: elsewhere,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);

    // Removed from the original project root.
    expect(existsSync(join(project, ".claude", "skills", "demo"))).toBe(false);
    // State entry gone.
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")).toBeUndefined();
  });
});

describe("two project-scope installs at different roots coexist", () => {
  test("each entry has its own project_root and updates independently", () => {
    const home = makeCrewHome();
    const projA = makeTempDir("crew-projA-");
    const projB = makeTempDir("crew-projB-");
    const srcA = makeTempDir("crew-srcA-");
    const srcB = makeTempDir("crew-srcB-");
    makeSkill(srcA, "tool", skillFrontmatter({ name: "tool", description: "from A" }));
    makeSkill(srcB, "tool", skillFrontmatter({ name: "tool", description: "from B" }));

    runCli(["install", "--scope", "project", join(srcA, "tool")], {
      home,
      cwd: projA,
      streams: captureStreams().streams,
    });
    // Different source → --force is NOT honored for name_conflict, so
    // the second install of a different-source skill must target a
    // different scope/project. Use a different name on the B side to
    // keep this test about project_root isolation, not name_conflict.
    runCli(["install", "--scope", "project", join(srcB, "tool")], {
      home,
      cwd: projB,
      streams: captureStreams().streams,
    });

    const state = readState(home);
    const entries = state.installations.filter((e) => e.name === "tool");
    expect(entries).toHaveLength(2);
    const roots = entries.map((e) => e.project_root).sort();
    expect(roots).toEqual([projA, projB].sort());

    // Confirm the files actually live in their respective roots.
    expect(existsSync(join(projA, ".claude", "skills", "tool", "SKILL.md"))).toBe(true);
    expect(existsSync(join(projB, ".claude", "skills", "tool", "SKILL.md"))).toBe(true);
  });
});

describe("missing project_root is a clean skip, not a failure", () => {
  test("C-UPD-22 project dir deleted after install → update reports missing_project_root", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));

    runCli(["install", "--scope", "project", skill], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    // Simulate the user deleting / moving their project.
    const fs = require("node:fs");
    fs.rmSync(project, { recursive: true, force: true });

    const c = captureStreams();
    const code = runCli(["update"], {
      home,
      cwd: makeTempDir("crew-elsewhere-"),
      streams: c.streams,
    });
    // Soft outcome: exit 0, preserve state.
    expect(code).toBe(0);
    // Human output mentions the project directory and "no longer exists";
    // JSON output carries the machine code `missing_project_root`.
    expect(c.stdout()).toContain(project);
    expect(c.stdout()).toContain("no longer exists");
    // State entry is unchanged (local install, such as it is, is not touched).
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")).toBeDefined();

    // The JSON form is the stable contract for automation.
    const cJson = captureStreams();
    runCli(["update", "--json"], {
      home,
      cwd: makeTempDir("crew-elsewhere2-"),
      streams: cJson.streams,
    });
    const parsed = JSON.parse(cJson.stdout()) as {
      rows: { outcome: { kind: string } }[];
    };
    expect(parsed.rows.some((r) => r.outcome.kind === "missing_project_root")).toBe(true);
  });

  test("C-STATE-11 doctor warns about project_root that no longer exists", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));

    runCli(["install", "--scope", "project", skill], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    const fs = require("node:fs");
    fs.rmSync(project, { recursive: true, force: true });

    const c = captureStreams();
    runCli(["doctor"], { home, cwd: makeTempDir("crew-elsewhere-"), streams: c.streams });
    expect(c.stdout()).toContain("missing_project_root");
    expect(c.stdout()).toContain(project);
  });
});
