import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import type { StateEntry } from "../../src/core/types.ts";
import {
  readState,
  removeByName,
  removeEntry,
  upsertEntry,
  writeState,
} from "../../src/state/load.ts";
import { acquireStateLock, withStateLock } from "../../src/state/lock.ts";
import { makeCrewHome } from "../helpers/env.ts";

const sample: StateEntry = {
  name: "foo",
  source: { tap: "core", path: "foo" },
  ref: null,
  resolved_sha: null,
  content_hash: "sha256:abc",
  scope: "user",
  installed_at: "2026-04-18T12:00:00Z",
  targets: ["claude-code"],
  pinned: false,
  explicit: true,
  required_by: [],
};

describe("state load/write", () => {
  test("missing state returns empty", () => {
    const home = makeCrewHome();
    const s = readState(home);
    expect(s.installations).toEqual([]);
  });

  test("corrupt state returns empty", () => {
    const home = makeCrewHome();
    require("node:fs").mkdirSync(home, { recursive: true });
    writeFileSync(paths(home).stateFile, "not json");
    const s = readState(home);
    expect(s.installations).toEqual([]);
  });

  test("upsertEntry adds", () => {
    const s = upsertEntry({ schema_version: 1, installations: [] }, sample);
    expect(s.installations).toHaveLength(1);
  });

  test("upsertEntry replaces by (name, scope)", () => {
    const base = { schema_version: 1 as const, installations: [sample] };
    const s = upsertEntry(base, { ...sample, targets: ["codex"] });
    expect(s.installations).toHaveLength(1);
    expect(s.installations[0]!.targets).toEqual(["codex"]);
  });

  test("removeByName removes all entries with name", () => {
    const other: StateEntry = { ...sample, scope: "project" };
    const base = { schema_version: 1 as const, installations: [sample, other] };
    const s = removeByName(base, "foo");
    expect(s.installations).toHaveLength(0);
  });

  test("removeEntry removes one scope", () => {
    const other: StateEntry = { ...sample, scope: "project" };
    const base = { schema_version: 1 as const, installations: [sample, other] };
    const s = removeEntry(base, "foo", "user");
    expect(s.installations).toHaveLength(1);
    expect(s.installations[0]!.scope).toBe("project");
  });

  test("writeState round-trip", () => {
    const home = makeCrewHome();
    writeState({ schema_version: 1, installations: [sample] }, home);
    const read = readState(home);
    expect(read.installations).toHaveLength(1);
  });
});

describe("state lock", () => {
  test("acquire and release", () => {
    const home = makeCrewHome();
    const lock = acquireStateLock(home, 1000);
    lock.release();
    // Double release is safe.
    lock.release();
  });

  test("C-CONC-02 second acquirer times out", () => {
    const home = makeCrewHome();
    const lock = acquireStateLock(home, 1000);
    try {
      expect(() => acquireStateLock(home, 100)).toThrow(CrewError);
    } finally {
      lock.release();
    }
  });

  test("withStateLock runs fn", () => {
    const home = makeCrewHome();
    const result = withStateLock(() => 42, home);
    expect(result).toBe(42);
  });

  test("withStateLock releases on throw", () => {
    const home = makeCrewHome();
    expect(() =>
      withStateLock(() => {
        throw new Error("boom");
      }, home),
    ).toThrow();
    // Should be able to reacquire.
    const lock = acquireStateLock(home, 1000);
    lock.release();
  });

  test("stale lock directory is reclaimed", () => {
    // proper-lockfile creates the lock as a directory at
    // `<stateFile>.lock` whose mtime tracks liveness. A lock older than
    // `stale: 60_000` is considered abandoned. We simulate this by
    // writing the lock dir with an ancient mtime, then confirming a
    // fresh acquire succeeds.
    const home = makeCrewHome();
    const { mkdirSync, utimesSync } = require("node:fs");
    mkdirSync(home, { recursive: true });
    writeFileSync(paths(home).stateFile, "{}");
    const lockDir = `${paths(home).stateFile}.lock`;
    mkdirSync(lockDir);
    const ancient = new Date(0);
    utimesSync(lockDir, ancient, ancient);
    const lock = acquireStateLock(home, 5000);
    lock.release();
  });
});
