/**
 * C-TAP-18 `crew install <tap-name>` installs every skill the tap exposes,
 * and C-TAP-21 path-kind taps are installable by bare name with no clone
 * (§16.4, §16.5).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import type { PromptFn } from "../../../src/cli/prompt.ts";
import { readConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
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

/** Always-"yes" prompt stub: matches the default behavior on enter. */
const alwaysYes: PromptFn = () => "yes";

describe("C-TAP-18 `crew install <tap-name>`", () => {
  test("installs every skill in the tap, attributing to <tap-name>", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildTapRepo("crew-tapinst-", ["alpha", "beta", "gamma"]);
    runCli(["tap", "add", `file://${repo}`, "teamtap"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "teamtap"], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const state = readState(home);
    const byName = new Map(state.installations.map((e) => [e.name, e]));
    expect(byName.size).toBe(3);
    for (const name of ["alpha", "beta", "gamma"]) {
      const entry = byName.get(name)!;
      expect(entry.source.tap).toBe("teamtap");
      expect(entry.explicit).toBe(true);
    }
  });
});

describe("C-TAP-21 path-kind tap", () => {
  test("`crew tap add <local-path>` creates a path tap with no clone", () => {
    const home = makeCrewHome();
    const root = makeTempDir("crew-pathtap-");
    makeSkill(root, "hello", skillFrontmatter({ name: "hello", description: "a skill" }));
    const code = runCli(["tap", "add", root, "localtap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const config = readConfig(home);
    const tap = config.taps.find((t) => t.name === "localtap")!;
    expect(tap.kind).toBe("path");
    expect(tap.path).toBe(root);
    // A path tap owns no clone; nothing should have been cloned at all.
    expect(existsSync(paths(home).reposDir)).toBe(false);
  });

  test("`crew tap add <same-path>` against an existing path tap is idempotent", () => {
    const home = makeCrewHome();
    const root = makeTempDir("crew-pathtap-idem-");
    makeSkill(root, "x", skillFrontmatter({ name: "x" }));
    runCli(["tap", "add", root, "mytap"], { home, streams: captureStreams().streams });
    const before = readConfig(home);
    const code = runCli(["tap", "add", root, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const after = readConfig(home);
    expect(after.taps.filter((t) => t.path === root)).toHaveLength(1);
    expect(after.taps).toHaveLength(before.taps.length);
  });

  test("bare-name install resolves through a path tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const root = makeTempDir("crew-pathtap-inst-");
    makeSkill(root, "hello", skillFrontmatter({ name: "hello", description: "a skill" }));
    runCli(["tap", "add", root, "localtap"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "hello"], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("localtap");
  });
});
