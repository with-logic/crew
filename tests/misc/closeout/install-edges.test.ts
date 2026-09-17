/**
 * Coverage close-out for install name conflicts, qualified dependency refs, zero-ref and JSON edges, --force on an inconsistent marker, and info from state.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

// Adapter redirection: any test in this file that runs `crew install`
// would otherwise write into the real `~/.claude/skills/` etc. Point
// each adapter's userPath at a per-test tmp root, and force `detect()`
// so we don't depend on the machine actually having Claude Code / Codex
// / Gemini installed. The CLAUDE.md testing philosophy requires this.
let ccRoot: string;
let restore: (() => void) | null = null;

function setupTargets() {
  ccRoot = makeTempDir("crew-cc-");
  const co = makeTempDir("crew-co-");
  const ge = makeTempDir("crew-ge-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => co;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => ge;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setupTargets());
afterEach(() => {
  resetGitRunner();
  if (restore) {
    restore();
  }
  restore = null;
});

describe("install/flow — name_conflict across every source kind", () => {
  test("path vs tap triggers name_conflict (flow.ts)", () => {
    const home = makeCrewHome();
    // Install from a path.
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Now try to install from a tap with the same name.
    const tapRepo = makeTempDir();
    makeGitRepo(tapRepo);
    makeSkill(tapRepo, "demo", skillFrontmatter({ name: "demo", description: "from tap" }));
    commitAll(tapRepo, "init");
    runCli(["tap", "add", `file://${tapRepo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "mytap/demo"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});

describe("install dependency: qualified refs", () => {
  test("qualified dependency (git URL) resolves", () => {
    const home = makeCrewHome();
    // Build a local git repo that hosts a dep skill.
    const depRepo = makeTempDir();
    makeGitRepo(depRepo);
    makeSkill(depRepo, "dep", skillFrontmatter({ name: "dep" }));
    commitAll(depRepo, "init");

    const parentDir = makeTempDir();
    makeSkill(
      parentDir,
      "root",
      skillFrontmatter({
        name: "root",
        dependencies: [`file://${depRepo}//dep`],
      }),
    );
    const code = runCli(["install", join(parentDir, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "dep"))).toBe(true);
  });
});

describe("install edge: zero refs", () => {
  test("install with no args errors", () => {
    const home = makeCrewHome();
    const code = runCli(["install"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});

describe("list --json + install --json", () => {
  test("list --json empty", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["list", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.installations).toEqual([]);
  });

  test("install --json", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const c = captureStreams();
    runCli(["install", "--json", join(src, "demo")], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.records[0].name).toBe("demo");
  });
});

describe("install --force on inconsistent_marker", () => {
  test("--force overrides inconsistent_marker", () => {
    const home = makeCrewHome();
    const dir = join(ccRoot, "demo");
    require("node:fs").mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".crew.json"),
      JSON.stringify({
        schema_version: 1,
        name: "other",
        source: { type: "path", path: "/x" },
        ref: null,
        resolved_sha: null,
        content_hash: "sha256:x",
        scope: "user",
        installed_at: "2026-04-18T00:00:00Z",
        installed_by: "crew/test",
      }),
    );
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", "--force", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("info — state path returns installed record", () => {
  test("info on installed name shows the state entry (info.ts:39)", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["info", "--json", "demo"], { home, streams: c.streams });
    expect(code).toBe(0);
    const parsed = JSON.parse(c.stdout()) as { installed?: { name: string } };
    expect(parsed.installed?.name).toBe("demo");
  });
});
