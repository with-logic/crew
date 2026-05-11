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
  tagRepo,
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
  tagRepo(repo, "v1");
  return repo;
}

function installQualifiedSkill(home: string) {
  const repo = buildTapRepo();
  runCli(["tap", "add", `file://${repo}`, "mytap"], {
    home,
    streams: captureStreams().streams,
  });
  // Keep the test tap as the only source for `alpha`; the default core tap is unrelated here.
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

  test("C-INFO-01 info accepts a qualified installed skill name", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);
    const capture = captureStreams();

    const code = runCli(["info", "--json", "mytap/alpha"], { home, streams: capture.streams });

    expect(code).toBe(0);
    const parsed = JSON.parse(capture.stdout()) as {
      installed: { source: { tap: string } };
      entries: readonly unknown[];
    };
    expect(parsed.installed.source.tap).toBe("mytap");
    expect(parsed.entries).toHaveLength(1);
  });

  test("uninstall does not treat a ref tail as part of an installed skill name", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);

    const code = runCli(["uninstall", "mytap/alpha@v1"], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(6);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
  });

  test("update does not treat a ref tail as part of an installed skill name", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);

    const code = runCli(["update", "mytap/alpha@v1"], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(4);
  });

  test("info with a ref tail previews the reference instead of installed state", () => {
    const home = makeCrewHome();
    installQualifiedSkill(home);
    const capture = captureStreams();

    const code = runCli(["info", "--json", "mytap/alpha@v1"], {
      home,
      streams: capture.streams,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(capture.stdout()) as {
      installed?: unknown;
      skills: readonly { name: string }[];
    };
    expect(parsed.installed).toBeUndefined();
    expect(parsed.skills.map((skill) => skill.name)).toEqual(["alpha"]);
  });
});
