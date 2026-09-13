/**
 * Doctor's orphan-store detection must agree with the collector (§11.2
 * check 5).
 *
 * A path-source install has no `resolved_sha`, so its store directory
 * is keyed by the short content hash instead. Detection and garbage
 * collection therefore have to derive the key the same way: if only one
 * of them does, doctor reports a live entry as orphaned and then claims
 * a repair addressed it, while the collector correctly preserves it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import type { StateEntry } from "../../../src/core/types.ts";
import { garbageCollectStore } from "../../../src/maintenance/gc.ts";
import { writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { pinDoctorEnv, unpinDoctorEnv } from "./helpers.ts";

beforeEach(pinDoctorEnv);
afterEach(unpinDoctorEnv);

const CONTENT_HASH = "sha256:abcdef1234567890";
/** The store key a path-source entry gets: name + first 8 hash chars. */
const STORE_KEY = "demo@abcdef12";

/** A user-scope path-source entry: no resolved SHA, keyed by content hash. */
function pathSourceEntry(): StateEntry {
  return {
    name: "demo",
    source: { tap: "local", path: "" },
    ref: null,
    resolved_sha: null,
    content_hash: CONTENT_HASH,
    scope: "user",
    installed_at: "2026-01-01T00:00:00Z",
    agents: [],
    pinned: false,
    explicit: true,
    required_by: [],
  };
}

describe("C-STATE-12c path-source store entries are not orphans", () => {
  test("doctor does not report a referenced path-source store entry", () => {
    const home = makeCrewHome();
    writeState({ schema_version: 1, installations: [pathSourceEntry()] }, home);
    mkdirSync(join(home, "store", STORE_KEY), { recursive: true });
    writeFileSync(join(home, "store", STORE_KEY, "SKILL.md"), "x");

    const c = captureStreams();
    runCli(["doctor"], { home, streams: c.streams });

    expect(c.stdout()).not.toContain("unreferenced store entry");
    expect(c.stdout()).not.toContain(STORE_KEY);
  });

  test("the collector keeps what detection now agrees is referenced", () => {
    const home = makeCrewHome();
    const state = { schema_version: 1 as const, installations: [pathSourceEntry()] };
    writeState(state, home);
    mkdirSync(join(home, "store", STORE_KEY), { recursive: true });
    writeFileSync(join(home, "store", STORE_KEY, "SKILL.md"), "x");

    // Asserted against the collector directly rather than through
    // `doctor --repair`: repair first rebuilds state from on-disk
    // markers, and this fixture has no marker, so the rebuilt state
    // legitimately drops the entry. That is the marker-authority rule
    // (§11.1), not the drift this test is about.
    expect(garbageCollectStore(state, home)).toEqual([]);
    expect(existsSync(join(home, "store", STORE_KEY))).toBe(true);
  });

  test("a stray file in the store root is not reported as an orphan entry", () => {
    const home = makeCrewHome();
    writeState({ schema_version: 1, installations: [] }, home);
    mkdirSync(join(home, "store"), { recursive: true });
    writeFileSync(join(home, "store", ".DS_Store"), "junk");

    const c = captureStreams();
    runCli(["doctor"], { home, streams: c.streams });

    // The collector only removes directories, so reporting a file as an
    // orphan entry promises a cleanup that never happens.
    expect(c.stdout()).not.toContain(".DS_Store");
  });
});
