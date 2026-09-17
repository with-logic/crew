/**
 * C-TAP-19 tap-vs-skill collision prompt (§16.5): the default, [n],
 * --yes bypass, and non-TTY abort paths.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildTapRepo } from "./helpers.ts";

let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
  ge: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  const ccRoot = makeTempDir("crew-cc-");
  const coRoot = makeTempDir("crew-co-");
  const geRoot = makeTempDir("crew-ge-");
  originals = {
    cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
    ge: { user: geminiCliAdapter.userPath, detect: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
  (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
  (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.user;
  (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.detect;
});

describe("C-TAP-19 tap/skill collision prompt", () => {
  /** Build two taps so `colliding` is both a tap name AND a skill in the other tap. */
  function buildCollision(home: string): { tapRepo: string; otherRepo: string } {
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapRepo = buildTapRepo("crew-col-tap-", ["inner"]);
    // Other tap contains a skill literally named "colliding".
    const otherRepo = buildTapRepo("crew-col-other-", ["colliding"]);
    runCli(["tap", "add", `file://${tapRepo}`, "colliding"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherRepo}`, "helpers"], {
      home,
      streams: captureStreams().streams,
    });
    return { tapRepo, otherRepo };
  }

  test("prompt defaults to tap on enter (Y)", () => {
    const home = makeCrewHome();
    buildCollision(home);
    // prompt returns "yes" → install the tap.
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      prompt: () => "yes",
    });
    expect(code).toBe(0);
    const state = readState(home);
    // Should have installed the single "inner" skill from tap "colliding".
    const names = state.installations.map((e) => e.name).sort();
    expect(names).toEqual(["inner"]);
    expect(state.installations[0]!.source.tap).toBe("colliding");
  });

  test("prompt with [n] installs the qualified skill from the other tap", () => {
    const home = makeCrewHome();
    buildCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      prompt: () => "no",
    });
    expect(code).toBe(0);
    const state = readState(home);
    const names = state.installations.map((e) => e.name).sort();
    expect(names).toEqual(["colliding"]);
    expect(state.installations[0]!.source.tap).toBe("helpers");
  });

  test("--yes skips the prompt and installs the tap", () => {
    const home = makeCrewHome();
    buildCollision(home);
    let promptCalls = 0;
    const code = runCli(["install", "colliding", "--yes"], {
      home,
      streams: captureStreams().streams,
      prompt: () => {
        promptCalls++;
        return "yes";
      },
    });
    expect(code).toBe(0);
    expect(promptCalls).toBe(0);
    const state = readState(home);
    expect(state.installations.map((e) => e.name).sort()).toEqual(["inner"]);
  });

  test("non-TTY (prompt returns abort) is a usage_error", () => {
    const home = makeCrewHome();
    buildCollision(home);
    const c = captureStreams();
    const code = runCli(["install", "colliding"], {
      home,
      streams: c.streams,
      prompt: () => "abort",
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("--yes");
    expect(c.stderr()).toContain("helpers/colliding");
  });
});
