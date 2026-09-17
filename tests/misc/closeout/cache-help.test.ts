/**
 * Coverage close-out for cache clean and per-command help.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

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

describe("cache clean", () => {
  test("empty cache succeeds", () => {
    const home = makeCrewHome();
    const code = runCli(["cache", "clean"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });

  test("cache clean removes unreferenced store entries and reports what it freed", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Manually create an orphan store entry with measurable content.
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "file.txt"), "x".repeat(4096));
    const c = captureStreams();
    const code = runCli(["cache", "clean"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(false);
    // Output names what was cleaned.
    expect(c.stdout()).toContain("Cache cleaned");
    expect(c.stdout()).toContain("orphan");
  });

  test("cache clean on a fresh home says nothing to clean", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["cache", "clean"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Nothing to clean");
  });

  test("unknown cache subcommand is a usage error pointing at help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["cache", "list"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("list");
    expect(c.stderr()).toContain("crew help cache");
  });

  test("bare `crew cache` shows the help page", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["cache"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("crew cache");
  });
});

describe("help command", () => {
  test("help <command> prints per-command lines", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["help", "install"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("crew install");
  });

  test("help <unknown> falls back to overview", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help", "frobnicate"], { home, streams: c.streams });
    expect(c.stdout()).toContain("crew ");
  });

  test("help --json on overview", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help", "--json"], { home, streams: c.streams });
    // Overview has no structured json field; should still emit valid JSON.
    expect(() => JSON.parse(c.stdout())).not.toThrow();
  });
});
