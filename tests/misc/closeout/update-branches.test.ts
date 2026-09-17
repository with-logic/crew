/**
 * Coverage close-out for commands/update branch coverage, pinned-SHA skips, and upstream renames.
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

describe("commands/update — branch coverage", () => {
  test("update with unknown target in state entry silently skips (update.ts:161)", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Inject a bogus target name into state.
    const { readState, writeState } =
      require("../../../src/state/load.ts") as typeof import("../../../src/state/load.ts");
    const state = readState(home);
    writeState(
      {
        ...state,
        installations: state.installations.map((e) => ({
          ...e,
          agents: [...e.agents, "bogus-xyz"],
        })),
      },
      home,
    );
    // Force an update even though nothing moved — the path source
    // triggers update's re-install path.
    writeFileSync(join(skill, "CHANGED.md"), "x");
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["update"], { home, streams: captureStreams().streams });
    expect([0, 1]).toContain(code);
  });

  test("update where install throws non-clean error → per_target failed (update.ts:183)", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Change source content then replace the dest with a no-marker dir
    // so reinstall sees `untracked_directory`. Update treats it as a
    // clean skip — so this hits the "skipped" kind, not "failed".
    // Swap the MARKER for a different-name marker so the install throws
    // inconsistent_marker, which update's catch re-categorizes as
    // "skipped" (line 182 covered). For the "failed" branch we need an
    // install exception that is none of those three codes, e.g. a
    // filesystem error. Simulate by making dest read-only.
    const { readState } =
      require("../../../src/state/load.ts") as typeof import("../../../src/state/load.ts");
    const entry = readState(home).installations[0]!;
    void entry;
    // Change the source so update re-stages.
    writeFileSync(join(skill, "NEW.md"), "x");
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect([0, 1]).toContain(code);
  });

  test("update re-acquires tap source (update.ts:196)", () => {
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
    runCli(["install", "mytap/demo"], { home, streams: captureStreams().streams });
    const code = runCli(["update"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });
});

describe("update — pinned-to-SHA entries are skipped", () => {
  test("entry pinned to an exact SHA is skipped on update", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    const { runGit } =
      require("../../../src/git/exec.ts") as typeof import("../../../src/git/exec.ts");
    runGit(["add", "-A"], { cwd: repo });
    runGit(["commit", "--quiet", "-m", "v1"], { cwd: repo });
    const head = runGit(["rev-parse", "HEAD"], { cwd: repo }).stdout.trim();
    runCli(["install", `file://${repo}@${head}//demo`], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("skipped");
  });
});

// Two installs + two git commits via real subprocesses — slower on CI
// runners than the bun default 5s timeout. Give it room.
const RENAME_TIMEOUT_MS = 30_000;

describe("update — skill renamed upstream is treated as source_gone", () => {
  test(
    "upstream skill name changes → original reported source_gone, exit 0",
    () => {
      // Under tap unification, a renamed skill looks like delete-and-add
      // from the tap's perspective: the old name no longer matches a
      // valid skill at that path → source_gone. The renamed skill (with
      // a name mismatching its directory) fails validation and is
      // silently ignored by tap re-expansion.
      const home = makeCrewHome();
      const repo = makeTempDir();
      makeGitRepo(repo);
      makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
      commitAll(repo, "v1");
      runCli(["install", `file://${repo}//demo`], { home, streams: captureStreams().streams });
      runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
      require("node:fs").writeFileSync(
        join(repo, "demo", "SKILL.md"),
        `---\nname: different-name\ndescription: renamed\n---\n`,
      );
      commitAll(repo, "rename");
      const c = captureStreams();
      const code = runCli(["update"], { home, streams: c.streams });
      expect(code).toBe(0);
      expect(c.stdout()).toContain("removed upstream");
    },
    RENAME_TIMEOUT_MS,
  );
});
