/**
 * C-TAP-23 known-tap suggestions on a search miss (§16.6): the human
 * and JSON shapes, and that a no-query listing ignores the registry.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { knownRegistry } from "./helpers.ts";

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
  test("C-TAP-23 search miss suggests known taps without adding them", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["search", "schema"], { home, streams: c.streams });
    expect(code).toBe(0);
    const out = c.stdout();
    expect(out).toContain('No skills match "schema" in your added taps.');
    expect(out).toContain("Trusted taps you can add");
    expect(out).toContain("supabase");
    expect(out).toContain("database/schema-review");
    expect(out).toContain(
      "Add tap: crew tap add https://github.com/example/supabase-skills supabase",
    );
    expect(out).toContain("crew install supabase/database/schema-review");

    const listed = captureStreams();
    runCli(["tap", "list"], { home, streams: listed.streams });
    expect(listed.stdout()).not.toContain("supabase");
  });

  test("C-TAP-23 search miss reports known hits in JSON", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["search", "--json", "schema"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      hits: unknown[];
      known_hits: {
        tap: string;
        url: string;
        subpath: string;
        trust: string;
        name: string;
        namespace: string | null;
        description: string;
      }[];
      warnings: string[];
    };
    expect(parsed.hits).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.known_hits).toEqual([
      {
        tap: "supabase",
        url: "https://github.com/example/supabase-skills.git",
        subpath: "skills",
        trust: "curated",
        name: "schema-review",
        namespace: "database",
        description: "Review SQL migrations and RLS policies.",
      },
    ]);
  });

  test("C-TAP-23 known root taps render add commands without subpath", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["search", "openai"], { home, streams: c.streams });
    expect(c.stdout()).toContain(
      "Add tap: crew tap add https://github.com/example/openai-skills openai",
    );
  });

  test("C-TAP-23 no-query ignores the known-tap registry", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(knownRegistry);
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["search"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("No skills in any tap you've added");
    expect(c.stdout()).not.toContain("Trusted taps you can add");
  });
});
