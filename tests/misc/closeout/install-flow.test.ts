/**
 * Coverage close-out for install/flow marker equality, install/resolve dependency edges, up_to_date reporting, and the same-SHA early exit.
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
import { readConfig } from "../../../src/config/load.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
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

describe("install/flow — marker source equality across kinds", () => {
  test("name_conflict fires across source kinds (flow.ts:126-128)", () => {
    const home = makeCrewHome();
    // Install from a path first.
    const src = makeTempDir();
    const skillDir = makeSkill(src, "demo", skillFrontmatter({ name: "demo", description: "A" }));
    runCli(["install", skillDir], { home, streams: captureStreams().streams });
    // Now try to install a skill with the same name from a GIT source.
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo", description: "B" }));
    commitAll(repo, "init");
    const code = runCli(["install", `file://${repo}//demo`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });
});

describe("install/resolve — dependency edge cases", () => {
  test("git-source dependency with a subpath resolves and installs", () => {
    // A dependency that uses a git URL ref form. The resolved skill name
    // comes from the dep's own SKILL.md, not from the reference tail.
    const home = makeCrewHome();
    const depRepo = makeTempDir();
    makeGitRepo(depRepo);
    makeSkill(depRepo, "dep", skillFrontmatter({ name: "dep" }));
    commitAll(depRepo, "init");

    const parent = makeTempDir();
    makeSkill(
      parent,
      "root",
      skillFrontmatter({
        name: "root",
        // `file://<path>` with no `//` subpath — parent dir is not a valid
        // skill, but the dep reference goes through the git-source-no-sub
        // branch.
        dependencies: [`file://${depRepo}//dep`],
      }),
    );
    const code = runCli(["install", join(parent, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("commands/install — up_to_date reporting", () => {
  test("reinstall after state deletion reports up-to-date per target (install.ts:60)", () => {
    // When the destination already has an identical marker but the state
    // entry has been removed (e.g. after state drift or `doctor` scratch
    // repair), `applyDuplicateRules` doesn't short-circuit — the skill
    // goes through `performInstall`, which sees the existing marker,
    // returns `up_to_date`, and the command formats "target=up-to-date".
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Drop the state entry while leaving the install (and its marker)
    // in place on disk.
    const { readState, writeState } =
      require("../../../src/state/load.ts") as typeof import("../../../src/state/load.ts");
    const state = readState(home);
    writeState({ ...state, installations: [] }, home);

    const c = captureStreams();
    const code = runCli(["install", skill], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("already up to date");
  });
});

describe("targets/install — same-SHA early exit", () => {
  test("direct re-install at same SHA + same content hash → up_to_date (install.ts:73)", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });

    // Re-run the install algorithm directly (bypassing the flow-level
    // "already installed" short-circuit) with the same SHA and content.
    const { installSkillIntoAgents } =
      require("../../../src/agents/install.ts") as typeof import("../../../src/agents/install.ts");
    const { claudeCodeAdapter } =
      require("../../../src/agents/claude-code.ts") as typeof import("../../../src/agents/claude-code.ts");
    const { hashDirectory } =
      require("../../../src/hash/content.ts") as typeof import("../../../src/hash/content.ts");
    const { readState } =
      require("../../../src/state/load.ts") as typeof import("../../../src/state/load.ts");
    const entry = readState(home).installations[0]!;
    const storeDir = join(home, "store");
    const storeEntry = require("node:fs").readdirSync(storeDir)[0]!;
    const storePath = join(storeDir, storeEntry);
    const result = installSkillIntoAgents({
      agents: [claudeCodeAdapter],
      scope: "user",
      cwd: process.cwd(),
      storePath,
      skillName: "demo",
      tap: readConfig(home).taps.find((t: TapConfig) => t.name === entry.source.tap)!,
      tapRelativePath: entry.source.path,
      ref: entry.ref,
      resolvedSha: entry.resolved_sha,
      contentHash: hashDirectory(storePath),
      force: false,
    });
    expect(result.kind).toBe("up_to_date");
  });
});
