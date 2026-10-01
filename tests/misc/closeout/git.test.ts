/**
 * Coverage close-out for git/repo (index + refs) error translation, classifyRef, and the git exec seam.
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
import { CrewError } from "../../../src/core/errors.ts";
import { resetGitRunner, runGit, setGitRunner } from "../../../src/git/exec.ts";
import { ensureRepo } from "../../../src/git/repo/index.ts";
import { classifyRef, initRepo, resolveRef } from "../../../src/git/repo/refs.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeGitRepo, makeTempDir } from "../../helpers/fixtures.ts";

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

describe("git/repo — error translation", () => {
  test("cloneRepo on a bogus URL becomes source_unreachable (repo.ts:38)", () => {
    const home = makeCrewHome();
    const bogusDir = join(home, "cache", "git", "bogus");
    expect(() => ensureRepo("file:///no/such/path.git", bogusDir)).toThrow(CrewError);
  });

  test("ensureRepo on an existing non-git dir errors (repo.ts:38)", () => {
    const fake = makeTempDir();
    writeFileSync(join(fake, "file.txt"), "x");
    expect(() => ensureRepo("file:///ignored", fake)).toThrow(CrewError);
  });

  test("ensureRepo fetch failure maps to source_unreachable", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    // Clone first so the dest exists.
    const dest = `${makeTempDir()}-clone`;
    ensureRepo(`file://${repo}`, dest);
    // Now swap the runner so the subsequent `fetch` fails.
    setGitRunner((args, opts) => {
      if (args[0] === "fetch") {
        return { stdout: "", stderr: "network down", exitCode: 1 };
      }
      // Delegate other git calls to a real run.
      const proc = Bun.spawnSync({
        cmd: ["git", ...args],
        ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        stdout: proc.stdout?.toString() ?? "",
        stderr: proc.stderr?.toString() ?? "",
        exitCode: proc.exitCode ?? -1,
      };
    });
    expect(() => ensureRepo(`file://${repo}`, dest)).toThrow(CrewError);
  });

  test("resolveRef on a ref git can't find raises ref_not_found (repo.ts:71)", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(() => resolveRef(repo, "no-such-ref-exists")).toThrow(CrewError);
  });

  test("checkoutSha on a bad SHA maps to ref_not_found", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    const { checkoutSha } =
      require("../../../src/git/repo/refs.ts") as typeof import("../../../src/git/repo/refs.ts");
    expect(() => checkoutSha(repo, "0".repeat(40))).toThrow(CrewError);
  });
});

describe("git classifyRef", () => {
  test("40-char hex is sha", () => {
    const repo = makeTempDir();
    initRepo(repo);
    writeFileSync(join(repo, "README.md"), "hello");
    runGit(["add", "."], { cwd: repo });
    runGit(["commit", "--quiet", "-m", "init", "--allow-empty"], { cwd: repo });
    const sha = runGit(["rev-parse", "HEAD"], { cwd: repo }).stdout.trim();
    expect(classifyRef(repo, sha)).toBe("sha");
  });

  test("tag is tag", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", "v1"], {
      cwd: repo,
    });
    expect(classifyRef(repo, "v1")).toBe("tag");
  });

  test("branch is branch", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(classifyRef(repo, "main")).toBe("branch");
  });

  test("null is branch", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(classifyRef(repo, null)).toBe("branch");
  });

  test("nonexistent is unknown", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(classifyRef(repo, "no-such-ref")).toBe("unknown");
  });
});

describe("git/classifyRef — abbreviated SHA (repo/refs.ts)", () => {
  test("abbreviated hex SHA classifies as sha", () => {
    const { classifyRef } =
      require("../../../src/git/repo/refs.ts") as typeof import("../../../src/git/repo/refs.ts");
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    const { runGit } =
      require("../../../src/git/exec.ts") as typeof import("../../../src/git/exec.ts");
    const fullSha = runGit(["rev-parse", "HEAD"], { cwd: repo }).stdout.trim();
    const abbreviated = fullSha.slice(0, 8);
    expect(classifyRef(repo, abbreviated)).toBe("sha");
  });
});

describe("git exec: non-zero with throwOnError: false", () => {
  test("runner returns result without throwing", () => {
    const { runGit } =
      require("../../../src/git/exec.ts") as typeof import("../../../src/git/exec.ts");
    setGitRunner(() => ({ stdout: "", stderr: "boom", exitCode: 42 }));
    const res = runGit(["status"], { throwOnError: false });
    expect(res.exitCode).toBe(42);
  });
  test("runner throws on non-zero when throwOnError defaults", () => {
    const { runGit } =
      require("../../../src/git/exec.ts") as typeof import("../../../src/git/exec.ts");
    setGitRunner(() => ({ stdout: "", stderr: "boom", exitCode: 42 }));
    expect(() => runGit(["status"])).toThrow();
  });
});
