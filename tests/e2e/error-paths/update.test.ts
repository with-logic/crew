/**
 * Update error paths (§10.1, §13): unreachable sources as soft warnings, skills
 * missing at the new revision, and path-entry source reconstruction.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot: string;

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
  if (restore) {
    restore();
  }
  restore = null;
});

describe("update: source_unreachable is a soft warning", () => {
  test("upstream repo gone → tap-refresh warns; per-skill update reads from local clone", () => {
    // Under tap unification, read-only operations read from the local
    // tap clone. Even if the upstream URL becomes unreachable, the
    // installed skill is still present locally, so update succeeds
    // with `up-to-date`. The tap-refresh phase emits a warning.
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });
    rmSync(repo, { recursive: true, force: true });
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("couldn't refresh tap");
  });
});

describe("update: missing skill at new revision", () => {
  test("C-UPD-11 SKILL.md deleted upstream → source_gone soft outcome", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");
    runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });
    // Delete the subpath upstream — acquireGit's `no_skills_found`
    // maps to `source_gone` under §10.1's upstream-deletion rule.
    rmSync(join(repo, "demo"), { recursive: true });
    commitAll(repo, "delete");
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    // C-UPD-12: exit 0 (soft outcome) — the local install is preserved.
    expect(code).toBe(0);
    expect(c.stdout()).toContain("removed upstream");
    // C-UPD-13: the state entry is preserved untouched.
    const { readState } =
      require("../../../src/state/load.ts") as typeof import("../../../src/state/load.ts");
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")).toBeDefined();
  });
});

describe("update: reconstructSource for path entry", () => {
  test("path-installed skill's update no-ops", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Path sources have resolved_sha=null so update sees "up-to-date" immediately.
    // ... but our update logic actually calls acquireSource which for a path
    // returns resolvedSha=null. Then `newSha === entry.resolved_sha` is
    // null === null → up-to-date.
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("up to date");
  });
});
