/**
 * maybeEmitUpdateNotice fetch and emission (§17.3): when the check runs, what
 * it records, and what it prints.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CREW_VERSION } from "../../../src/core/version.ts";
import { writeVersionCheck } from "../../../src/self-update/check.ts";
import { resetReleaseFetcher } from "../../../src/self-update/github.ts";
import { maybeEmitUpdateNotice } from "../../../src/self-update/notice.ts";

const RUNNING_TAG = `v${CREW_VERSION}`;

const savedEnv = {
  CREW_NOW: process.env["CREW_NOW"],
  CREW_NO_UPDATE_CHECK: process.env["CREW_NO_UPDATE_CHECK"],
  CREW_AUTOUPDATE_LOG: process.env["CREW_AUTOUPDATE_LOG"],
  CI: process.env["CI"],
};

beforeEach(() => {
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
  resetReleaseFetcher();
});

import { makeHarness } from "./helpers.ts";

describe("maybeEmitUpdateNotice — fetch + emission", () => {
  test("emits the notice when cached tag differs from running", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toContain("A new version of Homecrew is available");
    expect(h.streams.stderr()).toContain("v99.99.99");
    expect(h.streams.stderr()).toContain("crew self-update");
  });

  test("no notice when cached tag matches running version", () => {
    const h = makeHarness();
    writeVersionCheck(RUNNING_TAG, h.home);
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.streams.stderr()).toBe("");
  });

  test("no record + fetch succeeds: writes record and emits if newer", () => {
    const h = makeHarness("v99.99.99");
    maybeEmitUpdateNotice(h.ctx());
    expect(h.fetches.length).toBe(1);
    expect(h.streams.stderr()).toContain("v99.99.99");
  });

  test("no record + fetch says we're on latest: writes record, no notice", () => {
    const h = makeHarness(RUNNING_TAG);
    maybeEmitUpdateNotice(h.ctx());
    expect(h.fetches.length).toBe(1);
    expect(h.streams.stderr()).toBe("");
  });

  test("stale record + fetch succeeds: refreshes + emits against new tag", () => {
    const h = makeHarness("v99.99.99");
    // Record two days old with a stale tag
    process.env["CREW_NOW"] = "2026-04-18T00:00:00Z";
    writeVersionCheck(RUNNING_TAG, h.home);
    process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.fetches.length).toBe(1);
    expect(h.streams.stderr()).toContain("v99.99.99");
  });

  test("fresh record (within 24h): no fetch, emits against cached value", () => {
    const h = makeHarness();
    process.env["CREW_NOW"] = "2026-04-20T10:00:00Z";
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.fetches).toEqual([]);
    expect(h.streams.stderr()).toContain("v99.99.99");
  });

  test("stale record + fetch fails: no notice, no crash", () => {
    const h = makeHarness("throw");
    // Old stale record with the current running version cached — after
    // a failed fetch we fall back to the stale value (no nag).
    process.env["CREW_NOW"] = "2026-04-18T00:00:00Z";
    writeVersionCheck(RUNNING_TAG, h.home);
    process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.fetches.length).toBe(1);
    expect(h.streams.stderr()).toBe("");
  });

  test("stale record with old newer-tag + fetch fails: still emits the stale nag", () => {
    const h = makeHarness("throw");
    // Old record claimed a newer tag is out. Fetch fails; we'd rather
    // show yesterday's nag than silently drop it.
    process.env["CREW_NOW"] = "2026-04-18T00:00:00Z";
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
    maybeEmitUpdateNotice(h.ctx({ now: new Date("2026-04-20T12:00:00Z") }));
    expect(h.fetches.length).toBe(1);
    expect(h.streams.stderr()).toContain("v99.99.99");
  });
});
