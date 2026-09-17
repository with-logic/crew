/**
 * C-TAP-19 collision detection edges (§16.5): a path tap on the other
 * side, an unreachable tap skipped, and no prompt without a collision.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
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
  test("collision prompt triggers when the OTHER tap is a path tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // `colliding` is a tap name.
    const tapRepo = buildTapRepo("crew-col-pt-", ["any"]);
    runCli(["tap", "add", `file://${tapRepo}`, "colliding"], {
      home,
      streams: captureStreams().streams,
    });
    // And `colliding` is a skill in a PATH tap.
    const pathRoot = makeTempDir("crew-col-pathtap-");
    makeSkill(pathRoot, "colliding", skillFrontmatter({ name: "colliding" }));
    runCli(["tap", "add", pathRoot, "helpers"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      prompt: () => "no",
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("helpers");
  });

  test("an unreachable tap is silently skipped during collision detection", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapRepo = buildTapRepo("crew-col-unreach-", ["widget"]);
    runCli(["tap", "add", `file://${tapRepo}`, "widget"], {
      home,
      streams: captureStreams().streams,
    });
    // Inject an unreachable tap directly into config — first use will
    // try to clone and fail. Collision detection should skip it.
    const { readConfig, writeConfig } =
      require("../../../src/config/load.ts") as typeof import("../../../src/config/load.ts");
    const cfg = readConfig(home);
    writeConfig(
      {
        ...cfg,
        taps: [
          ...cfg.taps,
          {
            name: "offline",
            kind: "git" as const,
            registered: true,
            url: "file:///crew-missing-collision-target",
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    // Only the `widget` tap exists + one skill `widget` in that tap;
    // the offline tap can't be read so no cross-tap collision fires.
    // Prompt should NOT be invoked; tap-only install proceeds.
    let promptCalls = 0;
    const code = runCli(["install", "widget"], {
      home,
      streams: captureStreams().streams,
      prompt: () => {
        promptCalls++;
        return "yes";
      },
    });
    expect(code).toBe(0);
    expect(promptCalls).toBe(0);
  });

  test("no prompt when the tap name isn't also a skill in some other tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildTapRepo("crew-no-col-", ["alpha", "beta"]);
    runCli(["tap", "add", `file://${repo}`, "solo"], {
      home,
      streams: captureStreams().streams,
    });
    let promptCalls = 0;
    const code = runCli(["install", "solo"], {
      home,
      streams: captureStreams().streams,
      prompt: () => {
        promptCalls++;
        return "yes";
      },
    });
    expect(code).toBe(0);
    expect(promptCalls).toBe(0);
  });
});
