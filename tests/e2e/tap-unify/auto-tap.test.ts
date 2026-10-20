/**
 * C-TAP-20 auto-tap creation on `crew install <git-url>` (§16.4):
 * kind:git, registered:false, and name derivation with suffixing.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import type { PromptFn } from "../../../src/cli/prompt.ts";
import { readConfig } from "../../../src/config/load.ts";
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

/** Always-"yes" prompt stub: matches the default behavior on enter. */
const alwaysYes: PromptFn = () => "yes";

describe("C-TAP-20 auto-tap creation on `crew install <git-url>`", () => {
  test("creates a kind:git, registered:false tap", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-auto-", ["widget"]);
    const code = runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const config = readConfig(home);
    // Find the auto tap — one whose url matches the repo.
    const auto = config.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`);
    expect(auto).toBeDefined();
    expect(auto!.registered).toBe(false);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe(auto!.name);
  });

  test("auto-tap derivation preserves leading digits", () => {
    const { deriveAutoTapName } =
      require("../../../src/install/tap-naming.ts") as typeof import("../../../src/install/tap-naming.ts");
    expect(deriveAutoTapName("gh:foo/3d-skills", "")).toBe("3d-skills");
  });

  test("auto-tap suffix keeps incrementing past -2 when multiple names are taken", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-triple-", ["x"]);
    const { deriveAutoTapName } =
      require("../../../src/install/tap-naming.ts") as typeof import("../../../src/install/tap-naming.ts");
    const derived = deriveAutoTapName(`file://${repo}`, "");
    const altA = buildTapRepo("crew-triple-alt-a-", ["a"]);
    const altB = buildTapRepo("crew-triple-alt-b-", ["b"]);
    // Claim both `derived` and `<derived>-2` with unrelated repos.
    runCli(["tap", "add", `file://${altA}`, derived], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${altB}`, `${derived}-2`], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(tap.name).toBe(`${derived}-3`);
  });

  test("auto-tap name is suffixed -2 when the derived name collides", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-auto-collide-", ["item"]);
    const { deriveAutoTapName } =
      require("../../../src/install/tap-naming.ts") as typeof import("../../../src/install/tap-naming.ts");
    // What name would auto-tap derivation pick? Claim it first under a
    // DIFFERENT (but cloneable) repo so auto creation must suffix.
    const derived = deriveAutoTapName(`file://${repo}`, "");
    const otherRepo = buildTapRepo("crew-auto-collide-alt-", ["other"]);
    runCli(["tap", "add", `file://${otherRepo}`, derived], {
      home,
      streams: captureStreams().streams,
    });
    // Now install the target URL — its derived name is taken by a tap
    // with a different URL, so auto-tap creation must suffix to -2.
    const code = runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const config = readConfig(home);
    const bTaps = config.taps.filter((t) => t.kind === "git" && t.url === `file://${repo}`);
    expect(bTaps).toHaveLength(1);
    expect(bTaps[0]!.registered).toBe(false);
    expect(bTaps[0]!.name).toBe(`${derived}-2`);
  });
});
