/**
 * C-TAP-22 auto→registered promotion via `crew tap add <same-url>`
 * (§16.4): flips registered, rewrites state entries, leaves others alone.
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

describe("C-TAP-22 auto→registered promotion", () => {
  test("`crew tap add <same-url>` against an auto tap flips registered:true", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-promote-", ["widget"]);
    // Create an auto tap by installing the URL.
    runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    const before = readConfig(home);
    const auto = before.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(auto.registered).toBe(false);
    // Promote by re-adding with the SAME URL; give it a concrete name.
    const code = runCli(["tap", "add", `file://${repo}`, "teamtap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const after = readConfig(home);
    const tap = after.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(tap.registered).toBe(true);
    expect(tap.name).toBe("teamtap");
    // The state entry's source.tap was rewritten to the new name.
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("teamtap");
  });

  test("`crew tap add --recursive <same-url>` promotes and upgrades an auto tap", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-promote-recursive-", ["widget"]);
    runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    const before = readConfig(home);
    const auto = before.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(auto.registered).toBe(false);
    expect(auto.discovery).toBeUndefined();

    const code = runCli(["tap", "add", "--recursive", `file://${repo}`, "teamtap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(tap.name).toBe("teamtap");
    expect(tap.registered).toBe(true);
    expect(tap.discovery).toBe("recursive");
    expect(readState(home).installations[0]!.source.tap).toBe("teamtap");
  });

  test("promotion rewrites markers for project-scope installs too", () => {
    const home = makeCrewHome();
    const projectRoot = makeTempDir("crew-proj-");
    const repo = buildTapRepo("crew-promote-proj-", ["pwidget"]);
    // Auto-create a tap by installing at project scope.
    runCli(["install", `file://${repo}`, "--scope", "project"], {
      home,
      cwd: projectRoot,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    // Promote + rename.
    runCli(["tap", "add", `file://${repo}`, "projtap"], {
      home,
      cwd: projectRoot,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    // Only project-scope entries here; source.tap is rewritten.
    expect(state.installations[0]!.scope).toBe("project");
    expect(state.installations[0]!.source.tap).toBe("projtap");
  });

  test("promotion leaves OTHER taps' state entries untouched", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // Two separate taps; install one skill from each so state has
    // entries across both tap names.
    const repoA = buildTapRepo("crew-prom-a-", ["alpha"]);
    const repoB = buildTapRepo("crew-prom-b-", ["beta"]);
    runCli(["tap", "add", `file://${repoA}`, "stable"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["install", "alpha"], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    // Install from repoB as an auto tap, then promote-rename it.
    runCli(["install", `file://${repoB}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    const autoName = readConfig(home).taps.find(
      (t) => t.kind === "git" && t.url === `file://${repoB}`,
    )!.name;
    runCli(["tap", "add", `file://${repoB}`, "renamed"], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    const byName = new Map(state.installations.map((e) => [e.name, e]));
    // Alpha's source.tap is unaffected by B's rename.
    expect(byName.get("alpha")!.source.tap).toBe("stable");
    // Beta's source.tap was rewritten.
    expect(byName.get("beta")!.source.tap).toBe("renamed");
    expect(autoName).not.toBe("renamed"); // sanity: rename actually happened
  });
});
