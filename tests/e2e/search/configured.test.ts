/**
 * C-TAP-23 known-tap suggestions alongside configured taps (§16.6):
 * configured hits come first, and a known tap that is already
 * configured — by name or by source — is never suggested.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { knownRegistry, makeTestTap } from "./helpers.ts";

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
  test("C-TAP-23 configured matches are followed by known-tap suggestions", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-configured-first-", [
      { name: "schema-local", desc: "configured schema helper" },
    ]);
    runCli(["tap", "add", `file://${repo}`, "local"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", "schema"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      hits: unknown[];
      known_hits: { tap: string; name: string }[];
    };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.known_hits.map((h) => ({ tap: h.tap, name: h.name }))).toEqual([
      { tap: "supabase", name: "schema-review" },
    ]);
  });

  test("C-TAP-23 configured known taps are not suggested", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-known-configured-", [
      { name: "schema-local", desc: "configured schema helper" },
    ]);
    runCli(["tap", "add", `file://${repo}`, "supabase"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", "schema"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { hits: unknown[]; known_hits: unknown[] };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.known_hits).toEqual([]);
  });

  test("C-TAP-23 configured known tap sources are not suggested under another name", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-search-known-source-configured-");
    makeGitRepo(repo);
    const skillsDir = join(repo, "skills");
    mkdirSync(skillsDir);
    makeSkill(
      skillsDir,
      "schema-local",
      skillFrontmatter({ name: "schema-local", description: "configured schema helper" }),
    );
    commitAll(repo, "init");
    runCli(["tap", "add", `file://${repo}//skills`, "renamed-supabase"], {
      home,
      streams: captureStreams().streams,
    });

    const { readConfig, writeConfig } =
      require("../../../src/config/load.ts") as typeof import("../../../src/config/load.ts");
    const cfg = readConfig(home);
    writeConfig(
      {
        ...cfg,
        taps: cfg.taps.map((tap) =>
          tap.name === "renamed-supabase" && tap.kind === "git"
            ? { ...tap, url: "https://github.com/example/supabase-skills.git" }
            : tap,
        ),
      },
      home,
    );

    const c = captureStreams();
    runCli(["search", "--json", "schema"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { hits: unknown[]; known_hits: unknown[] };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.known_hits).toEqual([]);
  });
});
