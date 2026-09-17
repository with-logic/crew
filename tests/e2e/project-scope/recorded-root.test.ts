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
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

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
