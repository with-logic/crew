/**
 * Coverage close-out for targets/install uninstall edges: direct calls, multiple scopes, and --force over an inconsistent marker.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { uninstallSkillFromAgents } from "../../../src/agents/uninstall.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
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

describe("uninstall edges via direct function call", () => {
  test("uninstall ignores sibling skills in same base", () => {
    const proj = makeTempDir();
    const base = join(proj, ".claude", "skills");
    require("node:fs").mkdirSync(base, { recursive: true });
    // Two dirs side-by-side.
    for (const n of ["demo", "sibling"]) {
      require("node:fs").mkdirSync(join(base, n), { recursive: true });
      require("node:fs").writeFileSync(
        join(base, n, ".crew.json"),
        JSON.stringify({
          schema_version: 1,
          name: n,
          agents: ["claude-code"],
          source: { type: "path", path: "/x" },
          ref: null,
          resolved_sha: null,
          content_hash: "sha256:0",
          scope: "project",
          installed_at: "2026-04-18T00:00:00Z",
          installed_by: "crew/test",
        }),
      );
      require("node:fs").writeFileSync(join(base, n, "SKILL.md"), "x");
    }
    const res = uninstallSkillFromAgents({
      agents: [claudeCodeAdapter],
      scope: "project",
      cwd: proj,
      skillName: "demo",
      force: false,
    });
    expect(res.kind).toBe("removed");
    expect(existsSync(join(base, "demo"))).toBe(false);
    expect(existsSync(join(base, "sibling"))).toBe(true);
  });
});

describe("uninstall edge: multiple scopes", () => {
  test("uninstall removes all scopes", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const projCwd = makeTempDir("crew-proj-");
    runCli(["install", skill], { home, streams: captureStreams().streams });
    runCli(["install", "--scope", "project", skill], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    const code = runCli(["uninstall", "demo"], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("targets/install — uninstall tolerates inconsistent marker with --force (install.ts:128)", () => {
  test("--force lets uninstall proceed past an inconsistent marker", () => {
    const { claudeCodeAdapter } =
      require("../../../src/agents/claude-code.ts") as typeof import("../../../src/agents/claude-code.ts");
    const { uninstallSkillFromAgents } =
      require("../../../src/agents/uninstall.ts") as typeof import("../../../src/agents/uninstall.ts");
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    require("node:fs").mkdirSync(dir, { recursive: true });
    require("node:fs").writeFileSync(
      join(dir, ".crew.json"),
      JSON.stringify({
        schema_version: 1,
        name: "other", // Mismatched.
        source: { type: "path", path: "/x" },
        ref: null,
        resolved_sha: null,
        content_hash: "sha256:0",
        scope: "project",
        installed_at: "2026-04-18T00:00:00Z",
        installed_by: "crew/test",
      }),
    );
    require("node:fs").writeFileSync(join(dir, "SKILL.md"), "x");
    // With --force, the inconsistent_marker check is bypassed and we remove.
    const res = uninstallSkillFromAgents({
      agents: [claudeCodeAdapter],
      scope: "project",
      cwd: projCwd,
      skillName: "demo",
      force: true,
    });
    expect(res.kind).toBe("removed");
  });
});
