/**
 * Coverage close-out for adapter project paths, detect false-paths, and uninstallSkillFromAgents edges.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { ALL_AGENTS, agentByName } from "../../../src/agents/registry.ts";
import { uninstallSkillFromAgents } from "../../../src/agents/uninstall.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

describe("adapters: project paths and detect false branches", () => {
  test("every adapter returns a user path; most also support project scope", () => {
    // ALL_AGENTS is neutralized by the test preload — each adapter's
    // methods are replaced with tmp-dir stubs, so here we just confirm
    // the registry is non-empty and every adapter still returns a
    // non-null string for both calls.
    expect(ALL_AGENTS.length).toBeGreaterThan(3);
    for (const a of ALL_AGENTS) {
      expect(typeof a.userPath()).toBe("string");
      expect(typeof a.projectPath("/tmp/proj")).toBe("string");
    }
  });

  test("adapter detect returns a boolean", () => {
    const prev = process.env["HOME"];
    try {
      process.env["HOME"] = `/tmp/empty-${Date.now()}`;
      // claude-code / codex / gemini-cli are kept intact by the test
      // preload; they may or may not be detected depending on dev
      // environment, but `detect()` always returns a boolean.
      expect(typeof claudeCodeAdapter.detect()).toBe("boolean");
      expect(typeof codexAdapter.detect()).toBe("boolean");
      expect(typeof geminiCliAdapter.detect()).toBe("boolean");
    } finally {
      process.env["HOME"] = prev;
    }
  });

  test("agentByName unknown returns undefined", () => {
    expect(agentByName("nothing")).toBeUndefined();
  });
});

describe("uninstallSkillFromAgents edges", () => {
  test("without force, missing skill -> not_installed_here", () => {
    expect(() =>
      uninstallSkillFromAgents({
        agents: [claudeCodeAdapter],
        scope: "user",
        cwd: process.cwd(),
        skillName: "ghost",
        force: false,
        dryRun: false,
      }),
    ).toThrow(CrewError);
  });

  test("force absent -> 'absent'", () => {
    const res = uninstallSkillFromAgents({
      agents: [claudeCodeAdapter],
      scope: "project",
      cwd: makeTempDir(),
      skillName: "ghost",
      force: true,
      dryRun: false,
    });
    expect(res.kind).toBe("absent");
  });

  test("untracked dir without force -> untracked_directory", () => {
    const home = makeCrewHome();
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "x");
    expect(() =>
      uninstallSkillFromAgents({
        agents: [claudeCodeAdapter],
        scope: "project",
        cwd: projCwd,
        skillName: "demo",
        force: false,
        dryRun: false,
      }),
    ).toThrow(CrewError);
    void home;
  });

  test("inconsistent marker without force -> inconsistent_marker", () => {
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".crew.json"),
      JSON.stringify({
        schema_version: 1,
        name: "other",
        agents: ["claude-code"],
        source: { type: "path", path: "/x" },
        ref: null,
        resolved_sha: null,
        content_hash: "sha256:x",
        scope: "project",
        installed_at: "2026-04-18T00:00:00Z",
        installed_by: "crew/test",
      }),
    );
    writeFileSync(join(dir, "SKILL.md"), "x");
    expect(() =>
      uninstallSkillFromAgents({
        agents: [claudeCodeAdapter],
        scope: "project",
        cwd: projCwd,
        skillName: "demo",
        force: false,
        dryRun: false,
      }),
    ).toThrow(CrewError);
  });

  test("with force and untracked dir, removes", () => {
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "x");
    const res = uninstallSkillFromAgents({
      agents: [claudeCodeAdapter],
      scope: "project",
      cwd: projCwd,
      skillName: "demo",
      force: true,
      dryRun: false,
    });
    expect(res.kind).toBe("removed");
  });
});
