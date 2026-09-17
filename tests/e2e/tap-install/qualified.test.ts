/**
 * Install-from-tap by qualified `<tap>/<skill>` reference (§8.1):
 * tags, case-insensitivity, ambiguity, dependency tap fallback, and
 * unknown taps.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
  tagRepo,
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
  test("qualified tap ref", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "mytap/alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });

  test("install --recursive rejects tap-name refs", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const capture = captureStreams();
    const code = runCli(["install", "--recursive", "mytap/alpha"], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("only applies to direct git or path sources");
  });

  test("qualified tap ref is case-insensitive", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "MyTap/Alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });

  test("tap ref with tag", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    tagRepo(repo, "v1.0.0");
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
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
    runCli(["tap", "add", `file://${r1}`, "tap1"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${r2}`, "tap2"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["install", "alpha"], {
      home,
      streams: c.streams,
      promptChoice: () => "abort",
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("ambiguous across taps");
  });

  test("bare dependency falls back to parent's tap", () => {
    // Parent skill comes from tap1; dependency is a bare name that ALSO
    // exists in tap1 (preferred) even when tap2 has another copy.
    const home = makeCrewHome();
    const tap1 = makeTempDir("crew-tap1-");
    makeGitRepo(tap1);
    makeSkill(tap1, "dep-source", skillFrontmatter({ name: "dep", description: "in tap1" }));
    makeSkill(tap1, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));
    commitAll(tap1, "init");

    const tap2 = makeTempDir("crew-tap2-");
    makeGitRepo(tap2);
    makeSkill(tap2, "dep", skillFrontmatter({ name: "dep", description: "in tap2" }));
    commitAll(tap2, "init");

    runCli(["tap", "add", `file://${tap1}`, "tap1"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${tap2}`, "tap2"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    const code = runCli(["install", "tap1/root"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    // The `dep` from tap1 — same source — is the one recorded.
    const state = readState(home);
    const dep = state.installations.find((i) => i.name === "dep")!;
    expect(dep.source.tap).toBe("tap1");
    expect(dep.source.path).toBe("dep-source");
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
