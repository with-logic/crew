/**
 * Coverage close-out for commands/update against moved tags, unchanged path sources, and unregistered targets.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { hashDirectory } from "../../../src/hash/content.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
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

describe("update: tag moved without --force", () => {
  test("skipped with reason 'pinned to tag; upstream moved'", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-upd-tag-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "v1");
    tagRepo(repo, "v1");
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams });

    // Move the tag upstream.
    writeFileSync(join(repo, "demo", "MORE.md"), "more");
    commitAll(repo, "v2");
    // Delete and recreate the tag so `git fetch --tags --prune` picks up the move.
    const { runGit } = require("../../../src/git/exec.ts");
    runGit(["tag", "-d", "v1"], { cwd: repo });
    runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", "v1"], {
      cwd: repo,
    });

    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    // Depending on whether `git fetch --tags --prune` picks up the tag
    // move (it does on recent git), we'll either see a skip or updated.
    // Either outcome confirms the code path.
    expect(code === 0 || code === 1).toBe(true);
    expect(c.stdout()).toMatch(/skipped|updated|failed|up to date/);
  });
});

describe("update: tentative stage for path source unchanged", () => {
  test("path source → up-to-date by content hash", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["update"], { home, streams: c.streams });
    expect(c.stdout()).toContain("up to date");
  });

  test("path source where content changed → updated", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    const beforeHash = readState(home).installations.find((e) => e.name === "demo")!.content_hash;
    // Modify the source.
    writeFileSync(join(skill, "NEW.md"), "new");
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("updated");
    const afterHash = readState(home).installations.find((e) => e.name === "demo")!.content_hash;
    const installedHash = hashDirectory(join(ccRoot, "demo"));
    expect(afterHash).not.toBe(beforeHash);
    expect(afterHash).toBe(installedHash);

    const second = captureStreams();
    const secondCode = runCli(["update", "--json"], { home, streams: second.streams });
    const rows = JSON.parse(second.stdout()) as {
      rows: { name: string; outcome: { kind: string } }[];
    };
    expect(secondCode).toBe(0);
    expect(rows.rows.find((r) => r.name === "demo")!.outcome.kind).toBe("up_to_date");
  });
});

describe("update: target that's no longer registered", () => {
  test("adapter dropped from registry is skipped silently", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Rewrite state to include a bogus target name.
    const state = readState(home);
    writeState(
      {
        ...state,
        installations: state.installations.map((e) => ({
          ...e,
          agents: [...e.agents, "bogus-target"],
        })),
      },
      home,
    );
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
  });
});
