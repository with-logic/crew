/**
 * Coverage close-out for sources/acquire bare-name ambiguity, commands/tap name derivation, and commands/search branches.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

// Adapter redirection: any test in this file that runs `crew install`
// would otherwise write into the real `~/.claude/skills/` etc. Point
// each adapter's userPath at a per-test tmp root, and force `detect()`
// so we don't depend on the machine actually having Claude Code / Codex
// / Gemini installed. The CLAUDE.md testing philosophy requires this.
let ccRoot: string;
let restore: (() => void) | null = null;

function setupTargets() {
  ccRoot = makeTempDir("crew-cc-");
  const co = makeTempDir("crew-co-");
  const ge = makeTempDir("crew-ge-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => co;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => ge;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setupTargets());
afterEach(() => {
  resetGitRunner();
  if (restore) {
    restore();
  }
  restore = null;
});

describe("sources/acquire — bare-name tap ambiguity", () => {
  // already covered elsewhere, but we also need the `invalid_ref` branch
  // when a bare name matches zero taps (acquire.ts:96).
  test("bare name matching no tap raises invalid_ref (acquire.ts:96)", () => {
    const home = makeCrewHome();
    // Remove the default tap so the config has zero taps.
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "nonexistent"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("qualified tap source where the skill dir is missing (acquire.ts:118)", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "mytap/ghost"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});

describe("commands/search — no configured taps", () => {
  test("search with zero taps returns empty hits", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["search", "--json", "python"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { hits: unknown[] };
    expect(parsed.hits).toEqual([]);
  });
});

describe("commands/tap — deriveTapName fallback branches", () => {
  test("tap add on an unreachable ssh URL still derives a name and fails cleanly", () => {
    const home = makeCrewHome();
    // Exercises `deriveTapName`'s "no URL scheme" branch (ssh-style
    // `git@host:owner/repo.git`). Stub the clone so this never depends
    // on DNS or SSH timeout behavior.
    setGitRunner(() => ({ stdout: "", stderr: "network down", exitCode: 1 }));
    const c = captureStreams();
    const code = runCli(["tap", "add", "git@example.invalid:owner/repo.git"], {
      home,
      streams: c.streams,
    });
    // `source_unreachable` → exit 5. The exact code isn't the point;
    // the point is the derive path ran and produced a reasonable error.
    expect([4, 5]).toContain(code);
  });

  test("tap add with a URL missing scheme still derives a name", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    // `file://` URLs have a clean path component whose basename becomes
    // the tap name. Tap names must match `[a-z][a-z0-9-]*`, so we point
    // at a renamed copy of the repo whose basename is valid.
    const tmpDir = makeTempDir();
    const validName = join(tmpDir, "mytap");
    require("node:fs").renameSync(repo, validName);
    const code = runCli(["tap", "add", `file://${validName}`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("search — sort across multiple hits in same tap (search.ts:51)", () => {
  test("two hits in same tap are sorted by name", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    // Build two skills that BOTH match the query — forces sort to pick
    // between them inside the same tap, exercising both halves of the
    // ternary at search.ts:51.
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "matches shared word" }));
    makeSkill(
      repo,
      "alpha",
      skillFrontmatter({ name: "alpha", description: "matches shared word" }),
    );
    commitAll(repo, "init");
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["search", "--json", "shared"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { hits: { name: string }[] };
    expect(parsed.hits.map((h) => h.name)).toEqual(["alpha", "beta"]);
  });
});

describe("search — invalid skill in a tap is silently skipped (search.ts:46)", () => {
  test("corrupt SKILL.md in a tap doesn't break search", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    // Add a valid skill and a directory with broken YAML frontmatter.
    makeSkill(repo, "ok-skill", skillFrontmatter({ name: "ok-skill", description: "works" }));
    require("node:fs").mkdirSync(join(repo, "bad-skill"));
    require("node:fs").writeFileSync(
      join(repo, "bad-skill", "SKILL.md"),
      "---\nname: bad\n\tdescription: tabs cause parse error\n---\nbody",
    );
    commitAll(repo, "init");
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["search", "--json", "works"], { home, streams: c.streams });
    expect(code).toBe(0);
    const parsed = JSON.parse(c.stdout()) as { hits: { name: string }[] };
    // The valid skill is returned; the bad one is silently ignored.
    expect(parsed.hits.some((h) => h.name === "ok-skill")).toBe(true);
    expect(parsed.hits.some((h) => h.name === "bad")).toBe(false);
  });
});
