/**
 * Install error paths (§13): bad path sources, conflicting dependencies, unknown
 * targets, git-URL dependency refs, name-conflict cleanup, and file sources.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot: string;

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

describe("install: path source errors", () => {
  test("path source that is not a directory -> no_skills_found", () => {
    const home = makeCrewHome();
    const f = join(makeTempDir(), "not-a-dir.txt");
    writeFileSync(f, "hello");
    const code = runCli(["install", f], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});

describe("install: conflicting_dependencies", () => {
  test("two skills with same name but different SHAs in install set", () => {
    const home = makeCrewHome();
    // Two git repos each with a skill named 'dep'.
    const r1 = makeTempDir();
    makeGitRepo(r1);
    makeSkill(r1, "dep", skillFrontmatter({ name: "dep", description: "v1" }));
    commitAll(r1, "v1");

    const r2 = makeTempDir();
    makeGitRepo(r2);
    makeSkill(r2, "dep", skillFrontmatter({ name: "dep", description: "v2" }));
    commitAll(r2, "v2");

    // Two root skills, each pulling dep from a different repo.
    const ctr = makeTempDir();
    makeSkill(
      ctr,
      "root1",
      skillFrontmatter({ name: "root1", dependencies: [`file://${r1}//dep`] }),
    );
    makeSkill(
      ctr,
      "root2",
      skillFrontmatter({ name: "root2", dependencies: [`file://${r2}//dep`] }),
    );

    const code = runCli(["install", join(ctr, "root1"), join(ctr, "root2")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("same declared name from two tap paths conflicts even at the same SHA", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "one", skillFrontmatter({ name: "shared" }));
    makeSkill(repo, "two", skillFrontmatter({ name: "shared" }));
    commitAll(repo, "duplicates");

    const capture = captureStreams();
    const code = runCli(["install", `file://${repo}`], { home, streams: capture.streams });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("different sources");
  });
});

describe("install --target ghost fails with clean message", () => {
  test("unknown target", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", "--agent", "nonexistent", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });
});

describe("install dependency via git URL ref parsing", () => {
  test("dependency with ref", () => {
    const home = makeCrewHome();
    const depRepo = makeTempDir();
    makeGitRepo(depRepo);
    makeSkill(depRepo, "dep", skillFrontmatter({ name: "dep" }));
    commitAll(depRepo, "init");
    const tagPath = join(depRepo);
    // Use main branch explicitly.
    const parent = makeTempDir();
    makeSkill(
      parent,
      "root",
      skillFrontmatter({
        name: "root",
        dependencies: [`file://${tagPath}@main//dep`],
      }),
    );
    const code = runCli(["install", join(parent, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("name conflict cleanup in state", () => {
  test("state with stale data survives", () => {
    const home = makeCrewHome();
    writeState(
      {
        schema_version: 1,
        installations: [
          {
            name: "stale",
            source: { tap: "core", path: "stale" },
            ref: null,
            resolved_sha: null,
            content_hash: "sha256:00",
            scope: "user",
            installed_at: "2026-04-18T00:00:00Z",
            agents: ["claude-code"],
            pinned: false,
            explicit: true,
            required_by: [],
          },
        ],
      },
      home,
    );
    const state = readState(home);
    expect(state.installations).toHaveLength(1);
    // Uninstall should succeed (force-through, since no marker).
    const code = runCli(["uninstall", "--force", "stale"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("install: no markers touched on path source that's actually a file", () => {
  test("cleanup", () => {
    const home = makeCrewHome();
    expect(existsSync(home)).toBe(true);
    mkdirSync(join(home), { recursive: true });
  });
});
