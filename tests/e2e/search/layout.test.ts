/**
 * `crew search` output layout (§16.6): the count header, grouping by
 * tap, width truncation, and the styler primitive. Color is off in test
 * streams, so assertions are against plain text.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
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
  test("count header matches hits; grouped by tap; bold/dim stripped for non-TTY", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repoA = makeTestTap("crew-search-a-", [
      { name: "alpha", desc: "An alpha skill" },
      { name: "beta", desc: "A beta skill with alpha in description" },
    ]);
    const repoB = makeTestTap("crew-search-b-", [{ name: "alphabet", desc: "Letters" }]);
    runCli(["tap", "add", `file://${repoA}`, "tap-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${repoB}`, "tap-b"], {
      home,
      streams: captureStreams().streams,
    });

    const c = captureStreams();
    const code = runCli(["search", "alpha"], { home, streams: c.streams });
    expect(code).toBe(0);
    const out = c.stdout();
    // 3 hits: alpha/beta from tap-a (both match) and alphabet from tap-b.
    expect(out).toContain('3 matches for "alpha"');
    // Group headers appear once each (tap names are indented two
    // spaces under the header and bolded in TTY mode).
    expect(out).toContain("  tap-a");
    expect(out).toContain("  tap-b");
    // Skills appear under their groups, indented four spaces.
    expect(out).toMatch(/tap-a\n(.*\n)*? {4}alpha/);
    expect(out).toMatch(/tap-b\n(.*\n)*? {4}alphabet/);
    // No ANSI escape codes in the buffer (tests aren't a TTY).
    expect(out).not.toMatch(new RegExp(`${String.fromCharCode(0x1b)}\\[`));
  });

  test("singular noun when exactly one hit", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-one-", [{ name: "lonely", desc: "just me" }]);
    runCli(["tap", "add", `file://${repo}`, "only-tap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "lonely"], { home, streams: c.streams });
    expect(c.stdout()).toContain('1 match for "lonely"');
  });

  test("search walks path-kind taps too", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const root = makeTempDir("crew-search-path-");
    makeSkill(root, "findme", skillFrontmatter({ name: "findme", description: "in a path tap" }));
    runCli(["tap", "add", root, "localtap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["search", "findme"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("findme");
  });

  test("long descriptions are truncated to fit the terminal width", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-wide-", [
      {
        name: "wordy",
        desc: "a description that goes on and on and on and really should not survive truncation on a narrow terminal",
      },
    ]);
    runCli(["tap", "add", `file://${repo}`, "wtap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    // Force a narrow width so we can reliably assert truncation.
    runCli(["search", "wordy"], { home, streams: c.streams, width: 40 });
    const out = c.stdout();
    // Truncation marker.
    expect(out).toContain("…");
    // No output line (excluding header) exceeds the forced width.
    const skillLines = out.split("\n").filter((l) => l.includes("wordy"));
    for (const l of skillLines) expect(l.length).toBeLessThanOrEqual(40);
  });

  test("color styler wraps bold/dim; plain styler returns raw text", () => {
    // Direct test of the styler primitive. The CLI layer decides which to
    // use based on TTY/NO_COLOR; commands never compose raw ANSI themselves.
    const { makeStyler } =
      require("../../../src/util/term.ts") as typeof import("../../../src/util/term.ts");
    const plain = makeStyler(false);
    const ansi = makeStyler(true);
    expect(plain.bold("x")).toBe("x");
    expect(plain.dim("x")).toBe("x");
    const esc = String.fromCharCode(0x1b);
    expect(ansi.bold("x")).toMatch(new RegExp(`^${esc}\\[1m.+${esc}\\[0m$`));
    expect(ansi.dim("x")).toMatch(new RegExp(`^${esc}\\[2m.+${esc}\\[0m$`));
  });
});
