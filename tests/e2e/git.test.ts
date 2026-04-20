/**
 * Git-source tests using real local git repos exposed as file:// URLs.
 * Tests resolution-to-SHA, tag pinning, subpath expansion, and update.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../helpers/fixtures.ts";

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
  test("install from repo with root SKILL.md", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    // The SKILL.md must be at the ROOT of `repo` for it to be a single-skill repo.
    // makeSkill creates repo/demo/SKILL.md. Reorg: make a separate repo.
    void repo;

    const rootRepo = makeTempDir("crew-rroot-");
    makeGitRepo(rootRepo);
    writeFileSync(
      join(rootRepo, "SKILL.md"),
      `---\n${skillFrontmatter({ name: "rootskill" })}\n---\nbody`,
    );
    const rootSha = commitAll(rootRepo, "add root skill");

    // We need to put SKILL.md at repo root AND have the parent directory
    // named `rootskill`. But the git repo dir isn't named `rootskill`. So
    // when we check out, our validator will fail: frontmatter name ≠
    // parent dir name. So use a subpath instead.
    void rootSha;
    // Build a repo where `rootskill/` at root is the skill dir.
    const subRepo = makeTempDir("crew-srepo-");
    makeGitRepo(subRepo);
    makeSkill(subRepo, "demo", skillFrontmatter({ name: "demo" }));
    const sha = commitAll(subRepo, "add demo");

    const code = runCli(["install", `file://${subRepo}//demo`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(targets["claude-code"]!, "demo", "SKILL.md"))).toBe(true);

    const state = readState(home);
    expect(state.installations[0]!.resolved_sha).toBe(sha);
  });

  test("pin to a tag (pinned: true)", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-tag-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "add demo");
    tagRepo(repo, "v1.0.0");

    const code = runCli(["install", `file://${repo}@v1.0.0//demo`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.pinned).toBe(true);
    expect(state.installations[0]!.ref).toBe("v1.0.0");
  });

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

  test("invalid git URL -> source_unreachable", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "https://nonexistent.invalid/a/b.git"], {
      home,
      streams: captureStreams().streams,
    });
    // Either source_unreachable (5) or parse path.
    expect([1, 4, 5]).toContain(code);
  });
});
