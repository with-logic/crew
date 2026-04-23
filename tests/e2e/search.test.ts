/**
 * `crew search` output layout tests.
 *
 * The output shape is grouped-by-tap with a count header, a bold skill
 * name column, and descriptions truncated to terminal width. Color is
 * off in test streams (captureStreams produces non-TTY output), so
 * assertions here are against plain text. The TTY/color path is
 * exercised separately by `tests/util/term.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

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
afterEach(() => restoreAdapters());

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
    expect(c.stdout()).toContain("No skills match");
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

  test("--json output has the expected shape", () => {
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
      hits: {
        tap: string;
        name: string;
        namespace: string | null;
        description: string;
        installed: boolean;
      }[];
    };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]).toEqual({
      tap: "jtap",
      name: "json-test",
      namespace: null,
      description: "json friendly",
      installed: false,
    });
  });

  test("no-query: lists every skill in every tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repoA = makeTestTap("crew-search-all-a-", [
      { name: "alpha", desc: "An alpha" },
      { name: "beta", desc: "A beta" },
    ]);
    const repoB = makeTestTap("crew-search-all-b-", [{ name: "gamma", desc: "A gamma" }]);
    runCli(["tap", "add", `file://${repoA}`, "a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${repoB}`, "b"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["search"], { home, streams: c.streams });
    expect(code).toBe(0);
    const out = c.stdout();
    expect(out).toContain("3 skills available");
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
    expect(out).toContain("gamma");
  });

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
      hits: { name: string; installed: boolean }[];
    };
    const byName = new Map(parsed.hits.map((h) => [h.name, h.installed]));
    expect(byName.get("installed-skill")).toBe(true);
    expect(byName.get("other-skill")).toBe(false);
  });

  test("namespaced skills render as namespace/name; JSON carries namespace field", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // Build a tap with a namespace directory under skills/:
    //   skills/marketing/email-outreach/SKILL.md
    const repo = makeTempDir("crew-search-ns-");
    makeGitRepo(repo);
    const skillsDir = join(repo, "skills");
    mkdirSync(skillsDir);
    const marketing = join(skillsDir, "marketing");
    mkdirSync(marketing);
    makeSkill(
      marketing,
      "email-outreach",
      skillFrontmatter({ name: "email-outreach", description: "Send emails" }),
    );
    commitAll(repo, "init");
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });

    // Human output: the name column is the namespaced form.
    const human = captureStreams();
    runCli(["search"], { home, streams: human.streams });
    expect(human.stdout()).toContain("marketing/email-outreach");

    // JSON output: namespace populated.
    const c = captureStreams();
    runCli(["search", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      hits: { name: string; namespace: string | null }[];
    };
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]!.name).toBe("email-outreach");
    expect(parsed.hits[0]!.namespace).toBe("marketing");
  });

  test("empty config: no-query reports 'No skills in any configured tap'", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["search"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("No skills in any configured tap");
  });

  test("unreachable tap produces a warning", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const { readConfig, writeConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
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
            url: "file:///crew-missing-for-search-test",
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    const c = captureStreams();
    const code = runCli(["search"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stderr()).toContain("offline");
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
