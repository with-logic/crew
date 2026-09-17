/**
 * `crew search` naming (§16.6): results carry the declared SKILL.md
 * name, root-skill taps index by declared name, namespaced skills render
 * as `namespace/name`, and a miss prints a no-match line.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
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
  test("search results use SKILL.md name when the source directory differs", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-search-declared-name-");
    makeGitRepo(repo);
    makeSkill(
      repo,
      "firebase-data-connect-basics",
      skillFrontmatter({
        name: "firebase-data-connect",
        description: "Use Firebase Data Connect",
      }),
    );
    commitAll(repo, "init");
    runCli(["tap", "add", `file://${repo}`, "firebase"], {
      home,
      streams: captureStreams().streams,
    });

    const c = captureStreams();
    const code = runCli(["search", "--json", "firebase-data-connect"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(c.stdout()) as {
      hits: {
        tap: string;
        name: string;
        namespace: string | null;
        description: string;
        installed: boolean;
        same_name_installed: boolean;
      }[];
    };
    expect(parsed.hits).toEqual([
      {
        tap: "firebase",
        name: "firebase-data-connect",
        namespace: null,
        description: "Use Firebase Data Connect",
        installed: false,
        same_name_installed: false,
      },
    ]);
  });

  test("search indexes root-skill taps by declared SKILL.md name", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-root-skill-");
    makeSkill(repo, ".", skillFrontmatter({ name: "declared-root", description: "Root skill" }));
    runCli(["tap", "add", repo, "vendor"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    const code = runCli(["search", "declared-root"], { home, streams: capture.streams });

    expect(code).toBe(0);
    expect(capture.stdout()).toContain("declared-root");
    expect(capture.stdout()).toContain("Root skill");
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
});
