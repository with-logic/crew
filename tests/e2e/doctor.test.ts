/**
 * Doctor-command tests.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let targets: Record<string, string> = {};
let restore: (() => void) | null = null;

function setup() {
  const ccRoot = makeTempDir("crew-cc-");
  const coRoot = makeTempDir("crew-co-");
  const geRoot = makeTempDir("crew-ge-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  targets = { "claude-code": ccRoot, codex: coRoot, "gemini-cli": geRoot };
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setup());
afterEach(() => { if (restore) restore(); restore = null; });

describe("doctor", () => {
  test("clean state reports OK", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["doctor"], { home, streams: c.streams });
    expect(code).toBe(0);
  });

  test("C-STATE-07 --verify detects customization", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Corrupt one installed target.
    writeFileSync(join(targets["claude-code"]!, "demo", "SKILL.md"), "tampered");
    const c = captureStreams();
    runCli(["doctor", "--verify"], { home, streams: c.streams });
    expect(c.stdout()).toContain("customized");
  });

  test("C-STATE-06 --repair reconstructs state from markers", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Delete state.
    require("node:fs").rmSync(join(home, "state.json"));
    const code = runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(readState(home).installations.length).toBeGreaterThanOrEqual(1);
  });

  test("--json output", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["doctor", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(Array.isArray(parsed.findings)).toBe(true);
  });
});
