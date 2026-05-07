/**
 * Install-from-tap tests: exercise tap source acquisition.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
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

describe("C-UPD-19: crew update refreshes every configured tap", () => {
  test("new skill added to a tap is searchable after crew update", () => {
    const home = makeCrewHome();
    const tapRepo = buildTapRepo();
    runCli(["tap", "add", `file://${tapRepo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    // Remove core so the search only reflects our test tap.
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    // Search before upstream changes — only alpha, beta exist. Use
    // --json so we can check hits structurally (the human output now
    // mentions the query in a "no matches" message).
    {
      const c = captureStreams();
      runCli(["search", "--json", "gamma"], { home, streams: c.streams });
      const parsed = JSON.parse(c.stdout()) as { hits: { name: string }[] };
      expect(parsed.hits).toHaveLength(0);
    }

    // Upstream publishes a new skill. No crew install from this tap yet.
    makeSkill(tapRepo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(tapRepo, "add gamma");

    // `crew update` fetches every configured tap and fast-forwards the
    // working tree (C-UPD-19). After update, `crew search` reflects
    // upstream state for any tap — even taps the user never installed
    // from.
    const code = runCli(["update"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);

    const c = captureStreams();
    runCli(["search", "gamma"], { home, streams: c.streams });
    expect(c.stdout()).toContain("gamma");

    // The clone's working tree is now at the new HEAD, so the file
    // landed under ~/.crew/taps/mytap/gamma/SKILL.md — the same path
    // `crew search` reads from.
    const { join } = require("node:path") as typeof import("node:path");
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    expect(existsSync(join(home, "taps", "mytap", "gamma", "SKILL.md"))).toBe(true);
  });
});

describe("C-UPD-20: per-tap fetch failure doesn't abort update", () => {
  test("one broken tap emits a warning; other taps and skills still process", () => {
    const home = makeCrewHome();

    // Good tap: a real local git repo we can fetch from.
    const goodRepo = buildTapRepo();
    runCli(["tap", "add", `file://${goodRepo}`, "good"], {
      home,
      streams: captureStreams().streams,
    });
    // Broken tap: a file:// URL to a path that was deleted before update.
    const brokenRepoPath = makeTempDir("crew-broken-tap-");
    const fs = require("node:fs");
    fs.rmSync(brokenRepoPath, { recursive: true, force: true });
    // Inject the broken tap by hand (can't use `tap add`; it validates by cloning).
    const { writeConfig, readConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
    const cfg = readConfig(home);
    writeConfig(
      {
        ...cfg,
        taps: [
          ...cfg.taps,
          {
            name: "broken",
            kind: "git" as const,
            registered: true,
            url: `file://${brokenRepoPath}`,
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    // Install from the good tap so there's per-skill work to do during update.
    runCli(["install", "good/alpha"], { home, streams: captureStreams().streams });

    // Upstream: add a new sibling to the good tap.
    makeSkill(goodRepo, "delta", skillFrontmatter({ name: "delta" }));
    commitAll(goodRepo, "add delta");

    const c = captureStreams();
    const code = runCli(["update"], { home, streams: c.streams });
    // Exit 0: broken-tap fetch is a warning, not a hard failure.
    expect(code).toBe(0);
    // The warning is surfaced in human output.
    expect(c.stdout()).toMatch(/couldn't refresh tap.*broken/);
    // The good tap's per-skill work still happened: alpha was processed
    // (either updated or up-to-date) — we just need to see the per-skill
    // row for it to confirm the update loop ran.
    expect(c.stdout()).toContain("alpha");
    // And search picks up delta from the good tap even though broken failed.
    const s = captureStreams();
    runCli(["search", "delta"], { home, streams: s.streams });
    expect(s.stdout()).toContain("delta");
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
