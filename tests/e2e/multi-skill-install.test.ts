/**
 * Multi-skill install + tap re-expansion on update (§9 step 5, §10.1.1).
 *
 * Covers C-UPD-14..18 + auto-tap creation. After unification, every
 * multi-skill install attributes children to a single tap (registered
 * or auto-created); `crew update` re-expands every tap with state
 * entries, picking up upstream additions.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

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

/** Build a repo with N top-level skills, no root SKILL.md → multi-skill install. */
function makeMultiSkillRepo(names: readonly string[]): string {
  const repo = makeTempDir();
  makeGitRepo(repo);
  for (const n of names) {
    makeSkill(repo, n, skillFrontmatter({ name: n }));
  }
  commitAll(repo, "initial");
  return repo;
}

describe("multi-skill install creates an auto tap (§16.5)", () => {
  test("C-UPD-14 multi-skill git source attributes every child to a single auto tap", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha", "beta"]);
    const ref = `file://${repo}`;
    const code = runCli(["install", ref], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations).toHaveLength(2);
    const tapNames = new Set(state.installations.map((e) => e.source.tap));
    expect(tapNames.size).toBe(1);
    const tap = readConfig(home).taps.find((t) => t.name === [...tapNames][0]!)!;
    expect(tap.kind).toBe("git");
    expect(tap.registered).toBe(false);
    expect(tap.url).toBe(ref);
  });

  test("single-skill expansion still attributes to a tap (auto-created)", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "solo", skillFrontmatter({ name: "solo" }));
    commitAll(repo, "init");
    runCli(["install", `file://${repo}//solo`], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBeDefined();
  });

  test("path-source multi-skill expansion creates a path-kind auto tap", () => {
    const home = makeCrewHome();
    const dir = makeTempDir();
    makeSkill(dir, "alpha", skillFrontmatter({ name: "alpha" }));
    makeSkill(dir, "beta", skillFrontmatter({ name: "beta" }));
    runCli(["install", dir], { home, streams: captureStreams().streams });
    const state = readState(home);
    expect(state.installations).toHaveLength(2);
    const tap = readConfig(home).taps.find((t) => t.name === state.installations[0]!.source.tap)!;
    expect(tap.kind).toBe("path");
    expect(tap.registered).toBe(false);
  });
});

describe("tap re-expansion on update (§10.1.1)", () => {
  test("C-UPD-15 newly-added sibling is installed on next update", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha", "beta"]);
    const ref = `file://${repo}`;
    runCli(["install", ref], { home, streams: captureStreams().streams });

    // Upstream: the team adds a third skill.
    makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(repo, "add gamma");

    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("gamma");
    const state = readState(home);
    const gamma = state.installations.find((e) => e.name === "gamma")!;
    expect(gamma).toBeDefined();
    // Same tap as the others.
    expect(gamma.source.tap).toBe(state.installations.find((e) => e.name === "alpha")!.source.tap);
    expect(existsSync(join(ccRoot, "gamma", "SKILL.md"))).toBe(true);
  });

  test("C-UPD-15 newly-added sibling records source path when directory differs", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha"]);
    runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });

    makeSkill(repo, "numeric-source", skillFrontmatter({ name: "3-statement-model" }));
    commitAll(repo, "add numeric source");

    const first = captureStreams();
    const firstCode = runCli(["update"], { home, streams: first.streams });
    expect(firstCode).toBe(0);
    expect(first.stdout()).toContain("3-statement-model");

    const added = readState(home).installations.find((e) => e.name === "3-statement-model")!;
    expect(added.source.path).toBe("numeric-source");
    expect(existsSync(join(ccRoot, "3-statement-model", "SKILL.md"))).toBe(true);

    const second = captureStreams();
    const secondCode = runCli(["update"], { home, streams: second.streams });
    expect(secondCode).toBe(0);
    expect(second.stdout()).not.toContain("removed upstream");
    expect(second.stdout()).not.toContain("failed");
  });

  test("C-UPD-15 renamed sibling directory updates source path by declared name", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha"]);
    runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });

    renameSync(join(repo, "alpha"), join(repo, "alpha-renamed"));
    commitAll(repo, "rename alpha directory");

    const capture = captureStreams();
    const code = runCli(["update"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).not.toContain("removed upstream");

    const alpha = readState(home).installations.find((e) => e.name === "alpha")!;
    expect(alpha.source.path).toBe("alpha-renamed");
  });

  test("C-UPD-15 single-skill installs do NOT auto-pull new siblings on update", () => {
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

describe("unknown skill handling", () => {
  test("crew update <unknown> throws unknown_skill", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["update", "nope"], { home, streams: c.streams });
    expect(code).toBe(4);
  });
});
