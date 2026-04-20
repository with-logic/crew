/**
 * Tests for the post-command update notice (§10.4).
 *
 * Covers the suppression rules, the background-spawn trigger, and
 * the emission path. Everything happens against stubbed stream/spawn
 * seams — no real subprocesses are launched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetBackgroundSpawner, setBackgroundSpawner } from "../../src/self-update/background.ts";
import { writeVersionCheck } from "../../src/self-update/check.ts";
import { maybeEmitUpdateNotice, type NoticeContext } from "../../src/self-update/notice.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const savedEnv = {
  CREW_NOW: process.env["CREW_NOW"],
  CREW_NO_UPDATE_CHECK: process.env["CREW_NO_UPDATE_CHECK"],
  CREW_AUTOUPDATE_LOG: process.env["CREW_AUTOUPDATE_LOG"],
  CI: process.env["CI"],
};

beforeEach(() => {
  // Default to a stable wall clock + no suppression env vars. Tests
  // that want a suppression env var set it explicitly and the afterEach
  // restores it.
  process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
  delete process.env["CREW_NO_UPDATE_CHECK"];
  delete process.env["CREW_AUTOUPDATE_LOG"];
  delete process.env["CI"];
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetBackgroundSpawner();
});

interface Harness {
  readonly home: string;
  readonly spawns: string[];
  readonly streams: ReturnType<typeof captureStreams>;
  ctx(overrides?: Partial<NoticeContext>): NoticeContext;
}

function makeHarness(): Harness {
  const home = makeCrewHome();
  const spawns: string[] = [];
  setBackgroundSpawner((_argv, h) => spawns.push(h));
  const streams = captureStreams();
  return {
    home,
    spawns,
    streams,
    ctx(overrides = {}) {
      return {
        command: "list",
        home,
        json: false,
        quiet: false,
        streams: streams.streams,
        stderrIsTty: true,
        ...overrides,
      };
    },
  };
}

describe("maybeEmitUpdateNotice", () => {
  test("emits nothing when stderr isn't a TTY, even with a stale newer record", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ stderrIsTty: false }));
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing in --json mode", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ json: true }));
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing in --quiet mode", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ quiet: true }));
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing when the command is self-update", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ command: "self-update" }));
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing when the command is version", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ command: "version" }));
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing when CREW_NO_UPDATE_CHECK=1", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_NO_UPDATE_CHECK"] = "1";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing when CREW_AUTOUPDATE_LOG=1 (launchd autoupdater)", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_AUTOUPDATE_LOG"] = "1";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("emits nothing when CI is set", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CI"] = "true";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toBe("");
    expect(h.spawns).toEqual([]);
  });

  test("empty CI env var is treated as unset", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CI"] = "";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toContain("A new version of crew is available");
  });

  test("emits the notice when the cached tag is newer", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toContain("A new version of crew is available");
    expect(h.streams.stderr()).toContain("v99.99.99");
    expect(h.streams.stderr()).toContain("crew self-update");
  });

  test("does NOT emit the notice when the cached tag matches running version", () => {
    const h = makeHarness();
    // Cache says we're up to date; no notice should fire.
    writeVersionCheck("v0.3.1", h.home);
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.streams.stderr()).toBe("");
  });

  test("spawns a background check when no record exists yet", () => {
    const h = makeHarness();
    maybeEmitUpdateNotice(h.ctx());
    expect(h.spawns).toEqual([h.home]);
    // No cached record to nag about on the first run.
    expect(h.streams.stderr()).toBe("");
  });

  test("spawns a background check when the record is older than 24h", () => {
    const h = makeHarness();
    const oldRecord = "2026-04-18T00:00:00Z";
    process.env["CREW_NOW"] = oldRecord;
    writeVersionCheck("v99.99.99", h.home);
    // Back to current time.
    process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.spawns).toEqual([h.home]);
    expect(h.streams.stderr()).toContain("v99.99.99");
  });

  test("does NOT spawn when the record is fresh (within 24h)", () => {
    const h = makeHarness();
    const recent = "2026-04-20T10:00:00Z";
    process.env["CREW_NOW"] = recent;
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.spawns).toEqual([]);
    // Still emits the notice using the cached record.
    expect(h.streams.stderr()).toContain("v99.99.99");
  });
});
