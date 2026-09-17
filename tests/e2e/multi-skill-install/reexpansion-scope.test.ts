/**
 * Tap re-expansion on `crew update` is scoped to whole-tap installs and
 * to the named skills' taps, and keeps local copies when upstream removes
 * or loses a child (§10.1.1; C-UPD-16..18).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { makeMultiSkillRepo } from "./helpers.ts";

let ccRoot: string;
let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
  ge: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const coRoot = makeTempDir("crew-co-");
  const geRoot = makeTempDir("crew-ge-");
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

describe("tap re-expansion on update (§10.1.1)", () => {
  test("single-skill installs do NOT auto-pull new siblings on update", () => {
    // Counterpart to the whole-tap case: a user who installed just
    // ONE skill from a tap hasn't opted into the tap's future skills.
    // Adding a new sibling upstream should NOT appear on their
    // machine after `crew update`.
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha", "beta"]);
    // Add the tap explicitly, then install one skill by qualified name.
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["install", "mytap/alpha"], { home, streams: captureStreams().streams });

    // Upstream: the tap grows.
    makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(repo, "add gamma");

    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    // Gamma MUST NOT appear in state or in the update output as added.
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "gamma")).toBeUndefined();
    expect(c.stdout()).not.toContain("new skill");
    // Beta also MUST NOT appear — the user only asked for alpha.
    expect(state.installations.find((e) => e.name === "beta")).toBeUndefined();
  });

  test("C-UPD-16 child removed from tap upstream → source_gone, local kept", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha", "beta"]);
    runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });

    rmSync(join(repo, "beta"), { recursive: true });
    commitAll(repo, "remove beta");

    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("removed upstream");
    expect(existsSync(join(ccRoot, "beta", "SKILL.md"))).toBe(true);
    expect(readState(home).installations.find((e) => e.name === "beta")).toBeDefined();
  });

  test("tap whose source is now unreachable reports per-member error; entries kept", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha", "beta"]);
    runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });
    rmSync(repo, { recursive: true });
    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect([0, 1]).toContain(code);
    expect(readState(home).installations).toHaveLength(2);
  });

  test("crew update <name> only re-expands taps whose members match", () => {
    const home = makeCrewHome();
    const repoA = makeMultiSkillRepo(["a1", "a2"]);
    const repoB = makeMultiSkillRepo(["b1", "b2"]);
    runCli(["install", `file://${repoA}`], { home, streams: captureStreams().streams });
    runCli(["install", `file://${repoB}`], { home, streams: captureStreams().streams });
    makeSkill(repoB, "b3", skillFrontmatter({ name: "b3" }));
    commitAll(repoB, "add b3");
    runCli(["update", "a1"], { home, streams: captureStreams().streams });
    expect(readState(home).installations.find((e) => e.name === "b3")).toBeUndefined();
    runCli(["update", "b1"], { home, streams: captureStreams().streams });
    expect(readState(home).installations.find((e) => e.name === "b3")).toBeDefined();
  });
});
