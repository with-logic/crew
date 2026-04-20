/**
 * `crew search` output layout tests.
 *
 * The output shape is grouped-by-tap with a count header, a bold skill
 * name column, and descriptions truncated to terminal width. Color is
 * off in test streams (captureStreams produces non-TTY output), so
 * assertions here are against plain text. The TTY/color path is
 * exercised separately by `tests/util/term.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

describe("crew search output", () => {
  function makeTestTap(prefix: string, skills: readonly { name: string; desc: string }[]): string {
    const repo = makeTempDir(prefix);
    makeGitRepo(repo);
    for (const s of skills) {
      makeSkill(repo, s.name, skillFrontmatter({ name: s.name, description: s.desc }));
    }
    commitAll(repo, "init");
    return repo;
  }

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
    expect(out).toContain('Found 3 skills matching "alpha".');
    // Group headers appear once each.
    expect(out).toContain("tap-a\n");
    expect(out).toContain("tap-b\n");
    // Skills appear under their groups, indented.
    expect(out).toMatch(/tap-a\n(.*\n)*? {2}alpha/);
    expect(out).toMatch(/tap-b\n(.*\n)*? {2}alphabet/);
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
    expect(c.stdout()).toContain("Found 1 skill matching");
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

  test("empty result set prints a no-match line (still exit 0)", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-none-", [{ name: "widget", desc: "nothing useful" }]);
    runCli(["tap", "add", `file://${repo}`, "wtap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["search", "no-such-thing"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("no skills matched");
    expect(c.stdout()).toContain("no-such-thing");
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

  test("--json output is unchanged by the styling work", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTestTap("crew-search-json-", [{ name: "json-test", desc: "json friendly" }]);
    runCli(["tap", "add", `file://${repo}`, "jtap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", "json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      hits: { tap: string; name: string; description: string }[];
    };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]).toEqual({
      tap: "jtap",
      name: "json-test",
      description: "json friendly",
    });
  });

  test("color styler wraps bold/dim; plain styler returns raw text", () => {
    // Direct test of the styler primitive. The CLI layer decides which to
    // use based on TTY/NO_COLOR; commands never compose raw ANSI themselves.
    const { makeStyler } =
      require("../../src/util/term.ts") as typeof import("../../src/util/term.ts");
    const plain = makeStyler(false);
    const ansi = makeStyler(true);
    expect(plain.bold("x")).toBe("x");
    expect(plain.dim("x")).toBe("x");
    const esc = String.fromCharCode(0x1b);
    expect(ansi.bold("x")).toMatch(new RegExp(`^${esc}\\[1m.+${esc}\\[0m$`));
    expect(ansi.dim("x")).toMatch(new RegExp(`^${esc}\\[2m.+${esc}\\[0m$`));
  });
});
