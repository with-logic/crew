/**
 * Uninstall `--target` (§7.7): removing from a subset of agents while keeping
 * the shared store entry and dependency bookkeeping consistent.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

let ccRoot: string;
let coRoot: string;
let geRoot: string;
let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
  ge: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  coRoot = makeTempDir("crew-co-");
  geRoot = makeTempDir("crew-ge-");
  originals = {
    cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
    ge: { user: geminiCliAdapter.userPath, detect: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
  (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
  (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.user;
  (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.detect;
});

describe("uninstall --target", () => {
  function installOne(home: string): { skill: string; code: number } {
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", skill], { home, streams: captureStreams().streams });
    return { skill, code };
  }

  test("C-UNINST-10 removes from only the named target, leaves others", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(geRoot, "demo", "SKILL.md"))).toBe(true);

    const c = captureStreams();
    const code = runCli(["uninstall", "--agent", "codex", "demo"], { home, streams: c.streams });
    expect(code).toBe(0);
    // Codex removed, others kept.
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "demo", "SKILL.md"))).toBe(false);
    expect(existsSync(join(geRoot, "demo", "SKILL.md"))).toBe(true);
    // Output signals partial removal.
    expect(c.stdout()).toContain("kept elsewhere");
  });

  test("C-UNINST-11 state entry survives with reduced targets", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    runCli(["uninstall", "--agent", "codex", "demo"], { home, streams: captureStreams().streams });
    const state = readState(home);
    const demo = state.installations.find((e) => e.name === "demo")!;
    expect(demo).toBeDefined();
    expect(demo.agents).toEqual(["claude-code", "gemini-cli"]);
  });

  test("C-UNINST-12 removing the last target drops the entry entirely", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    // Remove from every target in two steps.
    runCli(["uninstall", "--agent", "codex", "--agent", "gemini-cli", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    {
      const state = readState(home);
      expect(state.installations.find((e) => e.name === "demo")!.agents).toEqual(["claude-code"]);
    }
    runCli(["uninstall", "--agent", "claude-code", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")).toBeUndefined();
  });

  test("C-UNINST-13 --prune does not cascade through a partial --target removal", () => {
    // Install foo with a dep bar, then partially uninstall foo.
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });

    // Partial uninstall of foo with --prune. foo's entry survives (still
    // in claude-code + gemini-cli), so bar is NOT orphaned.
    runCli(["uninstall", "--prune", "--agent", "codex", "foo"], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "foo")).toBeDefined();
    expect(state.installations.find((e) => e.name === "bar")).toBeDefined();
  });

  test("C-UNINST-14 naming a target the skill isn't in is a silent no-op", () => {
    // Install only into codex via --target, then try to uninstall from
    // claude-code — crew should shrug, not error.
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", "--agent", "codex", skill], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["uninstall", "--agent", "claude-code", "demo"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    // codex install is preserved.
    expect(existsSync(join(coRoot, "demo", "SKILL.md"))).toBe(true);
    // State entry is unchanged (still lists codex only).
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")!.agents).toEqual(["codex"]);
  });

  test("unknown --target produces a usage error with the known list", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    const c = captureStreams();
    const code = runCli(["uninstall", "--agent", "atari-basic", "demo"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("atari-basic");
    expect(c.stderr()).toContain("known agents");
  });

  test("full --prune removal still cascades normally", () => {
    // Sanity check: without --target, --prune still works as before.
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });
    runCli(["uninstall", "--prune", "foo"], { home, streams: captureStreams().streams });
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "foo")).toBeUndefined();
    expect(state.installations.find((e) => e.name === "bar")).toBeUndefined();
    // Reference the other tmp roots so the linter doesn't complain about
    // unused vars, and so these fixtures are known to have been set up.
    expect(existsSync(coRoot)).toBe(true);
    expect(existsSync(geRoot)).toBe(true);
  });
});
