/**
 * State selector e2e tests for installed skill commands (§7.4, §10.1).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot: string;
let restore: (() => void) | null = null;

function setupTargets() {
  ccRoot = makeTempDir("crew-cc-");
  const coRoot = makeTempDir("crew-co-");
  const originals = {
    cc: { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { userPath: codexAdapter.userPath, detect: codexAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.userPath;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.userPath;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  };
}

function buildTapRepo(): string {
  const repo = makeTempDir("crew-state-selector-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha" }));
  commitAll(repo, "init");
  return repo;
}

function installQualifiedSkill(home: string) {
  const repo = buildTapRepo();
  runCli(["tap", "add", `file://${repo}`, "mytap"], {
    home,
    streams: captureStreams().streams,
  });
  runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
  runCli(["install", "mytap/alpha"], { home, streams: captureStreams().streams });
}

beforeEach(() => setupTargets());
afterEach(() => {
  if (restore) {
    restore();
  }
  restore = null;
});

describe("installed skill selectors", () => {
  test("C-UNINST-18 uninstall accepts a qualified installed skill selector", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);

    const code = runCli(["uninstall", "mytap/alpha"], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(false);
    expect(readState(home).installations).toHaveLength(0);
  });

  test("C-UPD-25 update accepts a qualified installed skill selector", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);
    const capture = captureStreams();

    const code = runCli(["update", "mytap/alpha"], { home, streams: capture.streams });

    expect(code).toBe(0);
    expect(capture.stdout()).toContain("alpha");
  });

  test("info accepts a qualified installed skill selector", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);
    const capture = captureStreams();

    const code = runCli(["info", "--json", "mytap/alpha"], { home, streams: capture.streams });

    expect(code).toBe(0);
    const parsed = JSON.parse(capture.stdout()) as { installed: { source: { tap: string } } };
    expect(parsed.installed.source.tap).toBe("mytap");
  });
});
