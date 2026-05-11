/**
 * Unit coverage for tap re-expansion edge cases (§10.1.1).
 */

import { describe, expect, test } from "bun:test";
import type { Config, StateEntry, StateFile, TapConfig } from "../../src/core/types.ts";
import { reexpandTaps } from "../../src/install/tap-reexpand.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

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

    const result = reexpandTaps(state, config, home, [], () => {
      throw new Error("empty tap should not add children");
    });
    expect([...result.sourceGone]).toEqual(["missing"]);
    expect(result.rows[0]).toMatchObject({ name: "missing", kind: "source_gone" });
  });
});
