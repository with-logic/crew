/**
 * Coverage close-out for doctor --repair state-entry iteration and adapter back-fill.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

describe("doctor repair — filter iterates over existing state entries (doctor.ts:149)", () => {
  test("state entries present + markers present — filter callback runs", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Run repair with state entries intact; the filter pass iterates
    // over them, exercising the arrow callback.
    const code = runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });
});

describe("doctor repair — adds missing adapter to existing entry (doctor.ts:174)", () => {
  test("state has one target; another has marker → repair merges", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Add a second skill at project scope so state has two installations
    // and the `.map` iterates across a non-matching entry.
    const skill2 = makeSkill(src, "other", skillFrontmatter({ name: "other" }));
    const projCwd = makeTempDir();
    runCli(["install", "--scope", "project", skill2], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    // Truncate state's demo entry's targets to just claude-code.
    const { readState, writeState } =
      require("../../../src/state/load.ts") as typeof import("../../../src/state/load.ts");
    const state = readState(home);
    writeState(
      {
        ...state,
        installations: state.installations.map((e) =>
          e.name === "demo" ? { ...e, targets: ["claude-code"] } : e,
        ),
      },
      home,
    );
    // Repair should add the missing targets back to `demo` while leaving
    // `other` alone.
    const code = runCli(["doctor", "--repair"], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const after = readState(home);
    const demo = after.installations.find((i) => i.name === "demo")!;
    expect(demo.agents.length).toBeGreaterThan(1);
  });
});
