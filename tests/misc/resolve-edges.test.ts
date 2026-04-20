/**
 * Unit tests for install/resolve dependency handling, not covered by
 * end-to-end tests. These exercise the internal resolution functions
 * via the main entry point with bespoke fixtures.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

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
  if (restore) {
    restore();
  }
  restore = null;
});

describe("install: qualified git dependency", () => {
  test("git-sub dependency with subpath segment name", () => {
    const home = makeCrewHome();
    const depRepo = makeTempDir();
    makeGitRepo(depRepo);
    // Put the dep under `tools/dep` (a subpath).
    const skillDir = join(depRepo, "tools", "dep");
    require("node:fs").mkdirSync(skillDir, { recursive: true });
    require("node:fs").writeFileSync(
      join(skillDir, "SKILL.md"),
      `---\n${skillFrontmatter({ name: "dep" })}\n---\n`,
    );
    commitAll(depRepo, "init");

    const parent = makeTempDir();
    makeSkill(
      parent,
      "root",
      skillFrontmatter({
        name: "root",
        dependencies: [`file://${depRepo}//tools/dep`],
      }),
    );
    const code = runCli(["install", join(parent, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "dep"))).toBe(true);
  });

  test("dep via git URL with @ref", () => {
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
        dependencies: [`file://${depRepo}@main//dep`],
      }),
    );
    const code = runCli(["install", join(parent, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("install: sibling dep inside a git repo", () => {
  test("root from git subpath with bare dep → sibling in repo", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "dep", skillFrontmatter({ name: "dep" }));
    makeSkill(repo, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));
    commitAll(repo, "init");

    const code = runCli(["install", `file://${repo}//root`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "dep"))).toBe(true);
    expect(existsSync(join(ccRoot, "root"))).toBe(true);
  });

  test("root from path source with sibling dep", () => {
    const home = makeCrewHome();
    const ctr = makeTempDir();
    makeSkill(ctr, "dep", skillFrontmatter({ name: "dep" }));
    makeSkill(ctr, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));
    const code = runCli(["install", join(ctr, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "dep"))).toBe(true);
  });
});

describe("install: qualified tap dep via tap/name", () => {
  test("root from git, dep qualified to a tap", () => {
    const home = makeCrewHome();
    // Create a tap containing 'dep'.
    const tapRepo = makeTempDir();
    makeGitRepo(tapRepo);
    makeSkill(tapRepo, "dep", skillFrontmatter({ name: "dep" }));
    commitAll(tapRepo, "init");
    runCli(["tap", "add", `file://${tapRepo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    // Root skill with qualified dep reference.
    const parent = makeTempDir();
    makeSkill(parent, "root", skillFrontmatter({ name: "root", dependencies: ["mytap/dep"] }));
    const code = runCli(["install", join(parent, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "dep"))).toBe(true);
  });
});
