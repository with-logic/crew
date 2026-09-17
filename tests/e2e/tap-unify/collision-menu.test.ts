/**
 * C-TAP-19b tap-vs-skill collision with a numbered menu when two or
 * more other taps carry the skill (§16.5).
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

describe("C-TAP-19b tap/skill collision — numbered menu for 2+ other taps", () => {
  /**
   * Build three taps such that `colliding` is a tap name AND a skill
   * inside two other taps ("helpers-a" and "helpers-b"). Returns the
   * paths for assertions.
   */
  function buildMultiCollision(home: string): void {
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapRepo = buildTapRepo("crew-mcol-tap-", ["inner"]);
    const otherA = buildTapRepo("crew-mcol-a-", ["colliding"]);
    const otherB = buildTapRepo("crew-mcol-b-", ["colliding"]);
    runCli(["tap", "add", `file://${tapRepo}`, "colliding"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherA}`, "helpers-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherB}`, "helpers-b"], {
      home,
      streams: captureStreams().streams,
    });
  }

  test("default (choice 0) installs the tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 0 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.map((e) => e.name).sort()).toEqual(["inner"]);
    expect(state.installations[0]!.source.tap).toBe("colliding");
  });

  test("choice 1 installs the skill from the first other tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 1 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("helpers-a");
  });

  test("choice 2 installs the skill from the second other tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 2 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("helpers-b");
  });

  test("prompt message lists the tap and every qualified alternative", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    let seen = "";
    runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: (message) => {
        seen = message;
        return { kind: "choice", index: 0 };
      },
    });
    expect(seen).toContain("2 other taps");
    expect(seen).toContain("[1] install tap `colliding`");
    expect(seen).toContain("[2] install skill `helpers-a/colliding`");
    expect(seen).toContain("[3] install skill `helpers-b/colliding`");
    expect(seen).toContain("Choice [1-3, default 1]:");
  });

  test("--yes skips the menu and installs the tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    let calls = 0;
    const code = runCli(["install", "colliding", "--yes"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => {
        calls++;
        return { kind: "choice", index: 0 };
      },
    });
    expect(code).toBe(0);
    expect(calls).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("colliding");
  });

  test("non-TTY (abort) is a usage_error listing every qualified candidate", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const c = captureStreams();
    const code = runCli(["install", "colliding"], {
      home,
      streams: c.streams,
      promptChoice: () => "abort",
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("--yes");
    expect(c.stderr()).toContain("helpers-a/colliding");
    expect(c.stderr()).toContain("helpers-b/colliding");
  });
});
