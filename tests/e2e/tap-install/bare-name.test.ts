/**
 * Install-from-tap by bare name (§8.1, §16.4): declared SKILL.md names,
 * root-skill taps, case-insensitivity; plus `info` on a git source and
 * `list` across scopes.
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
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { buildTapRepo } from "./helpers.ts";

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

describe("tap source install", () => {
  test("C-INST-01 install by bare name from added tap", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    // Remove core to avoid network-fetch attempts.
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
  });

  test("bare skill install is case-insensitive", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "Alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
  });

  test("install uses SKILL.md name when the source directory differs", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-declared-name-tap-");
    makeGitRepo(repo);
    makeSkill(
      repo,
      "firebase-data-connect-basics",
      skillFrontmatter({ name: "firebase-data-connect" }),
    );
    makeSkill(repo, "numeric-source", skillFrontmatter({ name: "3-statement-model" }));
    commitAll(repo, "init");

    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    const firebaseCode = runCli(["install", "firebase-data-connect"], {
      home,
      streams: captureStreams().streams,
    });
    const numericCode = runCli(["install", "3-statement-model"], {
      home,
      streams: captureStreams().streams,
    });
    expect(firebaseCode).toBe(0);
    expect(numericCode).toBe(0);
    expect(existsSync(join(ccRoot, "firebase-data-connect", "SKILL.md"))).toBe(true);
    expect(existsSync(join(ccRoot, "firebase-data-connect-basics"))).toBe(false);
    expect(existsSync(join(ccRoot, "3-statement-model", "SKILL.md"))).toBe(true);

    const state = readState(home);
    const firebase = state.installations.find((i) => i.name === "firebase-data-connect")!;
    expect(firebase.source.path).toBe("firebase-data-connect-basics");
  });

  test("bare install finds root-skill tap by declared SKILL.md name", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-root-tap-");
    makeSkill(repo, ".", skillFrontmatter({ name: "declared-root" }));
    runCli(["tap", "add", repo, "vendor"], { home, streams: captureStreams().streams });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    const code = runCli(["install", "declared-root"], { home, streams: captureStreams().streams });

    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "declared-root", "SKILL.md"))).toBe(true);
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
