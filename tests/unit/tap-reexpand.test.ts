/**
 * Unit coverage for tap re-expansion edge cases (§10.1.1).
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../src/agents/codex.ts";
import { tapClonePath } from "../../src/core/repo-path.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../src/core/types.ts";
import { installNewTapChild } from "../../src/install/new-tap-child/index.ts";
import { type InstallNewChild, reexpandTaps } from "../../src/install/tap-reexpand/index.ts";
import { entryIdentity } from "../../src/state/collections/index.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string): TapConfig {
  return {
    name: "empty",
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path,
  };
}

function trackedEntry(): StateEntry {
  return {
    name: "missing",
    source: { tap: "empty", path: "missing" },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:x",
    scope: "user",
    installed_at: "2026-01-01T00:00:00Z",
    agents: ["codex"],
    pinned: false,
    explicit: true,
    required_by: [],
    tracks_tap: true,
  };
}

describe("reexpandTaps", () => {
  test("empty tap roots are treated as source_gone, not tap errors", () => {
    const home = makeCrewHome();
    const tap = pathTap(makeTempDir("crew-empty-reexpand-"));
    const config: Config = {
      taps: [tap],
      disabled_agents: [],
      forced_agents: [],
      autoupdate: { enabled: false, interval_seconds: 14400 },
    };
    const state: StateFile = { schema_version: 1, installations: [trackedEntry()] };

    const result = reexpandTaps(state, config, home, null, () => {
      throw new Error("empty tap should not add children");
    });
    // sourceGone carries entry identities, not bare names, so a relocated
    // entry with the same name at another scope is never conflated.
    expect([...result.sourceGone]).toEqual([entryIdentity(trackedEntry())]);
    expect(result.rows[0]).toMatchObject({ name: "missing", kind: "source_gone" });
  });

  test("tap expansion isolates inaccessible source directories", () => {
    const home = makeCrewHome();
    const path = makeTempDir("crew-unreadable-reexpand-");
    const tap = pathTap(path);
    const config: Config = {
      taps: [tap],
      disabled_agents: [],
      forced_agents: [],
      autoupdate: { enabled: false, interval_seconds: 14400 },
    };
    const state: StateFile = { schema_version: 1, installations: [trackedEntry()] };

    chmodSync(path, 0);
    try {
      const result = reexpandTaps(state, config, home, null, () => null);
      expect(result.rows[0]).toMatchObject({
        name: "missing",
        kind: "tap_error",
        error: { code: "source_unreachable" },
      });
      expect(result.hardFailure).toBe(true);
      expect(result.sourceGone.size).toBe(0);
    } finally {
      chmodSync(path, 0o755);
    }
  });
});

test("tap discovery propagates an unexpected URL parser error after acquisition", () => {
  const home = makeCrewHome();
  // Hand-edited config accepts this string; an existing mirror needs no transport.
  const tap: TapConfig = { ...pathTap(""), kind: "git", url: "https://[" };
  const clone = tapClonePath(tap, home);
  mkdirSync(clone, { recursive: true });
  makeSkill(clone, "demo", skillFrontmatter({ name: "demo" }));
  makeGitRepo(clone);
  const config: Config = {
    taps: [tap],
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 14400 },
  };
  const state: StateFile = { schema_version: 1, installations: [trackedEntry()] };
  const target = makeTempDir();
  const originalUserPath = codexAdapter.userPath;
  codexAdapter.userPath = () => target;
  const installOne: InstallNewChild = (args) => installNewTapChild(args, false, home, clone);
  try {
    const healthy = reexpandTaps(
      state,
      { ...config, taps: [pathTap(clone)] },
      home,
      null,
      installOne,
    );
    expect(healthy.hardFailure).toBe(false);
    expect(healthy.added).toMatchObject([{ name: "demo", source: { tap: "empty", path: "demo" } }]);
    expect(readFileSync(join(target, "demo", "SKILL.md"))).toEqual(
      readFileSync(join(clone, "demo", "SKILL.md")),
    );
    expect(() => reexpandTaps(state, config, home, null, installOne)).toThrow(TypeError);
  } finally {
    codexAdapter.userPath = originalUserPath;
  }
});
