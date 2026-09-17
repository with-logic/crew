/**
 * Coverage close-out for cli/output default streams, cli/main unexpected-error path, and non-JSON error rendering.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { defaultStreams, writeError, writeSuccess } from "../../../src/cli/output.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import { makeStyler } from "../../../src/util/term.ts";
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

describe("cli/output — default streams wrap process.stdout/stderr", () => {
  test("writeSuccess default streams send human lines to process.stdout", () => {
    const origWrite = process.stdout.write.bind(process.stdout);
    const captured: string[] = [];
    (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
      captured.push(s);
      return true;
    };
    try {
      writeSuccess({ exitCode: 0, human: ["hello"] }, false, false, defaultStreams);
    } finally {
      (process.stdout as unknown as { write: typeof origWrite }).write = origWrite;
    }
    expect(captured.join("")).toBe("hello\n");
  });

  test("writeError default streams send error lines to process.stderr", () => {
    const origWrite = process.stderr.write.bind(process.stderr);
    const captured: string[] = [];
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string) => {
      captured.push(s);
      return true;
    };
    try {
      writeError(new CrewError("usage_error", "boom"), false, defaultStreams, makeStyler(false));
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    expect(captured.join("")).toContain("boom");
  });

  test("writeSuccess emits `stderr` lines to streams.stderr", () => {
    const c = captureStreams();
    writeSuccess({ exitCode: 0, human: [], stderr: ["a warning"] }, false, false, c.streams);
    expect(c.stderr()).toBe("a warning\n");
  });
});

describe("cli/main — unexpected runtime error path", () => {
  test("non-CrewError thrown from a command produces usage_error exit 4", () => {
    // Wire a deliberately broken git runner so the `info` command (with
    // a git source) raises a non-CrewError runtime exception.
    setGitRunner(() => {
      throw new Error("synthetic runtime failure");
    });
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["info", "gh:owner/repo"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("unexpected error");
  });

  test("unknown runtime error with --json emits structured error", () => {
    setGitRunner(() => {
      throw new Error("synthetic");
    });
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["info", "--json", "gh:owner/repo"], { home, streams: c.streams });
    expect(code).toBe(4);
    const parsed = JSON.parse(c.stdout()) as { error: { name: string } };
    expect(parsed.error.name).toBe("usage_error");
  });

  test("error with no `.message` still produces a usage_error", () => {
    setGitRunner(() => {
      // biome-ignore lint/style/useThrowOnlyError: exercising a non-Error throw on purpose.
      throw "raw string throw";
    });
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["info", "gh:owner/repo"], { home, streams: c.streams });
    expect(code).toBe(4);
  });
});

describe("error output non-json mode", () => {
  test("CrewError writes to stderr", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["uninstall", "ghost"], { home, streams: c.streams });
    // Error message names the skill and points the user toward a remedy.
    expect(c.stderr()).toContain("ghost");
    expect(c.stderr()).toContain("crew list");
  });

  test("error renderer appends a remedy block for known codes", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    // `crew install` with no args → `usage_error`, which has a remedy hint.
    runCli(["install"], { home, streams: c.streams });
    expect(c.stderr()).toContain("Error");
    expect(c.stderr()).toContain("Next step");
    expect(c.stderr()).toContain("crew help");
  });

  test("tap add with no URL surfaces a friendly usage hint", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "add"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew tap add");
  });

  test("tap remove with no name surfaces a friendly usage hint", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "remove"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew tap remove");
  });

  test("targets enable/disable with no name surfaces a friendly usage hint", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "enable"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew agents enable");
  });
});
