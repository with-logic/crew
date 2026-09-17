/**
 * Updating skills installed from git sources (§10.1): up-to-date, new SHAs,
 * pinned and customized skips, and unknown names.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let targets: Record<string, string> = {};

function setup() {
  const ccRoot = makeTempDir("crew-cc-");
  const coRoot = makeTempDir("crew-co-");
  const geRoot = makeTempDir("crew-ge-");
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

  targets = { "claude-code": ccRoot, codex: coRoot, "gemini-cli": geRoot };
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setup());
afterEach(() => {
  if (restore) {
    restore();
  }
  restore = null;
});

describe("git sources via file:// URL", () => {
  test("crew update: up-to-date when no commits", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-upd-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "add demo");
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    const code = runCli(["update"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("up to date");
  });

  test("crew update: picks up new SHA", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-upd2-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    const firstSha = commitAll(repo, "add demo");
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });

    // Add a file to the skill to change the content, and commit.
    writeFileSync(join(repo, "demo", "NEW.md"), "new content");
    const secondSha = commitAll(repo, "update");
    expect(firstSha).not.toBe(secondSha);

    const capture = captureStreams();
    const code = runCli(["update"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("updated");
    expect(readState(home).installations[0]!.resolved_sha).toBe(secondSha);
    expect(existsSync(join(targets["claude-code"]!, "demo", "NEW.md"))).toBe(true);
  });

  test("C-UPD-03 crew update skips SHA-pinned without --force", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-upd-pin-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    const firstSha = commitAll(repo, "add demo");
    runCli(["install", `file://${repo}@${firstSha}//demo`], {
      home,
      streams: captureStreams().streams,
    });
    writeFileSync(join(repo, "demo", "NEW.md"), "new");
    commitAll(repo, "upd");

    const capture = captureStreams();
    const code = runCli(["update"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("skipped");
  });

  test("crew update skips customized", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-upd-cust-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "v1");
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });
    // User customizes one target.
    writeFileSync(join(targets["claude-code"]!, "demo", "MINE.md"), "my notes");
    // New upstream commit.
    writeFileSync(join(repo, "demo", "NEW.md"), "new");
    commitAll(repo, "v2");

    const capture = captureStreams();
    const code = runCli(["update"], { home, streams: capture.streams });
    // Customized on one target, succeeded on others → updated kind with per_target.
    expect(code).toBe(0);
    expect(existsSync(join(targets["claude-code"]!, "demo", "MINE.md"))).toBe(true);
  });

  test("crew update on unknown name errors", () => {
    const home = makeCrewHome();
    const code = runCli(["update", "nonexistent"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});
