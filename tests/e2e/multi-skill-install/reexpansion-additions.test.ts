/**
 * Tap re-expansion on `crew update` picks up upstream additions and
 * follows renamed or duplicated sibling directories (§10.1.1; C-UPD-15).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, renameSync } from "node:fs";
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

  test("newly-added sibling records source path when directory differs", () => {
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

  test("renamed sibling directory updates source path by declared name", () => {
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

  test("duplicate declared sibling name does not re-point existing source path", () => {
    const home = makeCrewHome();
    const repo = makeMultiSkillRepo(["alpha"]);
    runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });

    makeSkill(repo, "alpha-copy", skillFrontmatter({ name: "alpha" }));
    commitAll(repo, "add duplicate alpha");

    const capture = captureStreams();
    const code = runCli(["update"], { home, streams: capture.streams });
    expect(code).toBe(1);
    expect(capture.stdout()).toContain("conflicting");

    const alpha = readState(home).installations.find((e) => e.name === "alpha")!;
    expect(alpha.source.path).toBe("alpha");
  });
});
