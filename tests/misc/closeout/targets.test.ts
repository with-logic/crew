/**
 * Coverage close-out for targets/path, the targets list rendering, and the targets subcommands.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

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

describe("targets/path — existsSync edge (path.ts:27-28)", () => {
  test("PATH entry whose file is neither a file nor a symlink is skipped", () => {
    // Create a directory (not a file) named `crew-test-stub` on a PATH
    // component and verify `isOnPath` returns false.
    const { isOnPath } =
      require("../../../src/agents/path.ts") as typeof import("../../../src/agents/path.ts");
    const dir = makeTempDir();
    require("node:fs").mkdirSync(join(dir, "target-dir-not-a-binary"));
    const prev = process.env["PATH"];
    try {
      process.env["PATH"] = dir;
      expect(isOnPath("target-dir-not-a-binary")).toBe(false);
    } finally {
      process.env["PATH"] = prev;
    }
  });
});

describe("targets list renders disabled flag (targets.ts:39)", () => {
  test("disabled target shows `disabled` label in list output", () => {
    const home = makeCrewHome();
    runCli(["agents", "disable", "codex"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["agents"], { home, streams: c.streams });
    expect(c.stdout()).toContain("disabled");
  });
});

describe("targets subcommands", () => {
  test("targets enable/disable cycle", () => {
    const home = makeCrewHome();
    runCli(["agents", "disable", "claude-code"], { home, streams: captureStreams().streams });
    runCli(["agents", "enable", "claude-code"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["agents", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.agents.find((t: { name: string }) => t.name === "claude-code").forced).toBe(true);
  });

  test("unknown agent errors", () => {
    const home = makeCrewHome();
    const code = runCli(["agents", "enable", "no-such"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("unknown agents subcommand is a usage error pointing at help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "frob"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("frob");
    expect(c.stderr()).toContain("crew help agents");
  });
});
