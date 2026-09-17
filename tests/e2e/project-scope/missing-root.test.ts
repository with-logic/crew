/**
 * A project directory deleted after a project-scope install is a clean
 * skip for `crew update` and a warning from `crew doctor`, never a
 * failure (§10.1.1, §11; C-UPD-22, C-STATE-11).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

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
    expect(c.stdout()).toContain("project folder is missing");
    expect(c.stdout()).toContain(project);
  });
});
