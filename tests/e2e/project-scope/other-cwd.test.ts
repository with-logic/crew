/**
 * Project-scope installs are updated and uninstalled at their recorded
 * `project_root`, whatever the current directory is when the later
 * command runs (the `crew autoupdate` case; §10.1, §7.4).
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
