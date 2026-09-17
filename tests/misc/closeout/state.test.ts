/**
 * Coverage close-out for state/load upsertEntry and malformed-installations handling.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { readState, upsertEntry } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

// Adapter redirection: any test in this file that runs `crew install`
// would otherwise write into the real `~/.claude/skills/` etc. Point
// each adapter's userPath at a per-test tmp root, and force `detect()`
// so we don't depend on the machine actually having Claude Code / Codex
// / Gemini installed. The CLAUDE.md testing philosophy requires this.
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
  resetGitRunner();
  if (restore) {
    restore();
  }
  restore = null;
});

describe("upsertEntry preserves other entries", () => {
  test("two entries, upsert one", () => {
    const home = makeCrewHome();
    let state = readState(home);
    state = upsertEntry(state, {
      name: "a",
      source: { tap: "core", path: "a" },
      ref: null,
      resolved_sha: null,
      content_hash: "sha256:a",
      scope: "user",
      installed_at: "2026-04-18T00:00:00Z",
      agents: ["claude-code"],
      pinned: false,
      explicit: true,
      required_by: [],
    });
    state = upsertEntry(state, {
      name: "b",
      source: { tap: "core", path: "b" },
      ref: null,
      resolved_sha: null,
      content_hash: "sha256:b",
      scope: "user",
      installed_at: "2026-04-18T00:00:00Z",
      agents: ["claude-code"],
      pinned: false,
      explicit: true,
      required_by: [],
    });
    state = upsertEntry(state, {
      name: "a",
      source: { tap: "core", path: "a" },
      ref: null,
      resolved_sha: null,
      content_hash: "sha256:a",
      scope: "user",
      installed_at: "2026-04-18T00:00:00Z",
      agents: ["codex"],
      pinned: false,
      explicit: true,
      required_by: [],
    });
    expect(state.installations).toHaveLength(2);
    const a = state.installations.find((i) => i.name === "a")!;
    expect(a.agents).toEqual(["codex"]);
  });
});

describe("state load: non-object in installations", () => {
  test("non-array installations falls back to empty", () => {
    const home = makeCrewHome();
    require("node:fs").mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, "state.json"),
      JSON.stringify({ schema_version: 1, installations: "bad" }),
    );
    const s = readState(home);
    expect(s.installations).toEqual([]);
  });
  test("raw primitive falls back to empty", () => {
    const home = makeCrewHome();
    require("node:fs").mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "state.json"), JSON.stringify(42));
    const s = readState(home);
    expect(s.installations).toEqual([]);
  });
});
