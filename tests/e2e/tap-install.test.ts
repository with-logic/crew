/**
 * Install-from-tap tests: exercise tap source acquisition.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
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

/** Build a repo that will be added as a tap (two skills: alpha, beta). */
function buildTapRepo(): string {
  const repo = makeTempDir("crew-tap-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha" }));
  makeSkill(repo, "beta", skillFrontmatter({ name: "beta" }));
  commitAll(repo, "init");
  return repo;
}

describe("tap source install", () => {
  test("C-INST-01 install by bare name from added tap", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    // Remove core to avoid network-fetch attempts.
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
  });

  test("qualified tap ref", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "mytap/alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });

  test("tap ref with tag", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    tagRepo(repo, "v1.0.0");
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "mytap/alpha@v1.0.0"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readState(home).installations[0]!.pinned).toBe(true);
  });

  test("ambiguous bare name in two taps", () => {
    const home = makeCrewHome();
    const r1 = buildTapRepo();
    const r2 = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${r1}`, "tap1"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", "--yes", `file://${r2}`, "tap2"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("bare dependency falls back to parent's tap", () => {
    // Parent skill comes from tap1; dependency is a bare name that ALSO
    // exists in tap1 (preferred) even when tap2 has another copy.
    const home = makeCrewHome();
    const tap1 = makeTempDir("crew-tap1-");
    makeGitRepo(tap1);
    makeSkill(tap1, "dep", skillFrontmatter({ name: "dep", description: "in tap1" }));
    makeSkill(tap1, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));
    commitAll(tap1, "init");

    const tap2 = makeTempDir("crew-tap2-");
    makeGitRepo(tap2);
    makeSkill(tap2, "dep", skillFrontmatter({ name: "dep", description: "in tap2" }));
    commitAll(tap2, "init");

    runCli(["tap", "add", "--yes", `file://${tap1}`, "tap1"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", "--yes", `file://${tap2}`, "tap2"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    const code = runCli(["install", "tap1/root"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    // The `dep` from tap1 — same source — is the one recorded.
    const state = readState(home);
    const dep = state.installations.find((i) => i.name === "dep")!;
    expect(dep.source.type).toBe("tap");
  });

  test("nonexistent tap name fails", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "no-such-tap/demo"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });
});

describe("info on git source", () => {
  test("info prints details from fresh git source", () => {
    const repo = makeTempDir("crew-info-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo", homepage: "https://x" }));
    commitAll(repo, "init");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["info", `file://${repo}//demo`], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("demo");
  });
});

describe("list on multi-scope", () => {
  test("both scopes visible", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const projCwd = makeTempDir();
    runCli(["install", skill], { home, streams: captureStreams().streams });
    runCli(["install", "--scope", "project", skill], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["list", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.installations.length).toBe(2);
  });
});

describe("update on named skill", () => {
  test("named skill only", () => {
    const home = makeCrewHome();
    const repo1 = makeTempDir("crew-upd-a-");
    makeGitRepo(repo1);
    makeSkill(repo1, "a", skillFrontmatter({ name: "a" }));
    commitAll(repo1, "init");
    const repo2 = makeTempDir("crew-upd-b-");
    makeGitRepo(repo2);
    makeSkill(repo2, "b", skillFrontmatter({ name: "b" }));
    commitAll(repo2, "init");
    runCli(["install", `file://${repo1}//a`], { home, streams: captureStreams().streams });
    runCli(["install", `file://${repo2}//b`], { home, streams: captureStreams().streams });
    // Bump only repo1.
    writeFileSync(join(repo1, "a", "NEW"), "x");
    commitAll(repo1, "bump");
    writeFileSync(join(repo2, "b", "NEW"), "x");
    commitAll(repo2, "bump");
    const c = captureStreams();
    runCli(["update", "a"], { home, streams: c.streams });
    expect(c.stdout()).toContain("a ");
    expect(c.stdout()).not.toContain("b [");
  });
});
