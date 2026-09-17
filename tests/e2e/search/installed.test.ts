/**
 * `crew search` installed markers (§16.6): ✓ for installed skills and
 * C-TAP-08c's same-name-elsewhere marker after a tap is removed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { makeTestTap } from "./helpers.ts";

/**
 * Redirect the three detectable adapters to tmp directories so
 * installs in this suite never write to `~/.claude/skills` etc.
 * Mirrors the pattern in `tests/e2e/install.test.ts`.
 */
let restoreAdapters: () => void = () => {};
beforeEach(() => {
  const ccRoot = makeTempDir("search-cc-");
  const coRoot = makeTempDir("search-co-");
  const geRoot = makeTempDir("search-ge-");
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
  restoreAdapters = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
});
afterEach(() => {
  restoreAdapters();
  resetKnownTapsForTest();
});

describe("crew search output", () => {
  test("installed skills are marked with ✓", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-marked-", [
      { name: "installed-skill", desc: "I am here" },
      { name: "other-skill", desc: "I am not" },
    ]);
    runCli(["tap", "add", `file://${repo}`, "marked-tap"], {
      home,
      streams: captureStreams().streams,
    });
    // Pre-install one of the two skills — the beforeEach redirects
    // each adapter's user path to a tmp dir so this install never
    // touches the real `~/.claude/skills/` etc.
    runCli(["install", "marked-tap/installed-skill"], {
      home,
      streams: captureStreams().streams,
    });

    const c = captureStreams();
    runCli(["search", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      hits: { name: string; installed: boolean; same_name_installed: boolean }[];
    };
    const byName = new Map(parsed.hits.map((h) => [h.name, h]));
    expect(byName.get("installed-skill")).toMatchObject({
      installed: true,
      same_name_installed: false,
    });
    expect(byName.get("other-skill")).toMatchObject({
      installed: false,
      same_name_installed: false,
    });
  });

  test("C-TAP-08c same-name skills from removed taps are not marked installed", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const oldRepo = makeTestTap("crew-search-old-shared-", [
      { name: "shared", desc: "Old tap bytes" },
    ]);
    const newRepo = makeTestTap("crew-search-new-shared-", [
      { name: "shared", desc: "New tap bytes" },
    ]);
    runCli(["tap", "add", `file://${oldRepo}`, "oldtap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["install", "oldtap/shared"], { home, streams: captureStreams().streams });
    runCli(["tap", "remove", "oldtap"], { home, streams: captureStreams().streams });
    runCli(["tap", "add", `file://${newRepo}`, "newtap"], {
      home,
      streams: captureStreams().streams,
    });

    const json = captureStreams();
    runCli(["search", "--json", "shared"], { home, streams: json.streams });
    const parsed = JSON.parse(json.stdout()) as {
      hits: { tap: string; name: string; installed: boolean; same_name_installed: boolean }[];
    };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]).toMatchObject({
      tap: "newtap",
      name: "shared",
      installed: false,
      same_name_installed: true,
    });

    const human = captureStreams();
    runCli(["search", "shared"], { home, streams: human.streams, width: 120 });
    expect(human.stdout()).not.toContain("✓ shared");
    expect(human.stdout()).toContain("! shared");
    expect(human.stdout()).toContain("same name installed elsewhere");
    const conflict = runCli(["install", "newtap/shared"], {
      home,
      streams: captureStreams().streams,
    });
    expect(conflict).toBe(4);
  });
});
