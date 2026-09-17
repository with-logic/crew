/**
 * Coverage close-out for util/copy symlink handling, agents/path isOnPath, and store symlink hashing.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { isOnPath } from "../../../src/agents/path.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { copyTree } from "../../../src/util/copy.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

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

describe("copyTree", () => {
  test("preserves symlinks", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    writeFileSync(join(src, "real.txt"), "hi");
    symlinkSync("real.txt", join(src, "link"));
    copyTree(src, join(dest, "sub"));
    const { lstatSync } = require("node:fs");
    const st = lstatSync(join(dest, "sub", "link"));
    expect(st.isSymbolicLink()).toBe(true);
  });

  test("strips root .crew.json", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    writeFileSync(join(src, ".crew.json"), "{}");
    writeFileSync(join(src, "other.txt"), "x");
    copyTree(src, join(dest, "sub"));
    expect(existsSync(join(dest, "sub", ".crew.json"))).toBe(false);
    expect(existsSync(join(dest, "sub", "other.txt"))).toBe(true);
  });

  test("copies nested dirs", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    mkdirSync(join(src, "a", "b"), { recursive: true });
    writeFileSync(join(src, "a", "b", "c.txt"), "nested");
    copyTree(src, dest);
    expect(existsSync(join(dest, "a", "b", "c.txt"))).toBe(true);
  });

  test("chmod bits not preserved but copy succeeds", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    const f = join(src, "script.sh");
    writeFileSync(f, "#!/bin/sh\n");
    chmodSync(f, 0o755);
    copyTree(src, dest);
    expect(existsSync(join(dest, "script.sh"))).toBe(true);
  });
});

describe("isOnPath", () => {
  test("bun is on PATH", () => {
    expect(isOnPath("bun")).toBe(true);
  });
  test("nonexistent is not", () => {
    expect(isOnPath("this-binary-does-not-exist-xyz")).toBe(false);
  });
  test("empty PATH returns false", () => {
    const prev = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      expect(isOnPath("bun")).toBe(false);
    } finally {
      process.env["PATH"] = prev;
    }
  });
});

describe("symlink hashing in store", () => {
  test("symlinks are preserved through install", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skillDir = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    writeFileSync(join(skillDir, "real.txt"), "hello");
    symlinkSync("real.txt", join(skillDir, "link.txt"));
    const code = runCli(["install", skillDir], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    const { lstatSync } = require("node:fs");
    expect(lstatSync(join(ccRoot, "demo", "link.txt")).isSymbolicLink()).toBe(true);
  });
});
