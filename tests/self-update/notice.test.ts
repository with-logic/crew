/**
 * Tests for the post-command update notice (§10.4).
 *
 * Covers the suppression rules, the 24h synchronous-fetch trigger,
 * and the emission path. The release fetch is stubbed — no real HTTP.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeVersionCheck } from "../../src/self-update/check.ts";
import { resetReleaseFetcher, setReleaseFetcher } from "../../src/self-update/github.ts";
import { maybeEmitUpdateNotice, type NoticeContext } from "../../src/self-update/notice.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

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

interface Harness {
  readonly home: string;
  readonly fetches: string[];
  readonly streams: ReturnType<typeof captureStreams>;
  ctx(overrides?: Partial<NoticeContext>): NoticeContext;
}

/** Install a fetcher that records every call and returns the given tag. */
function makeHarness(latestTag: string | "throw" = "v99.99.99"): Harness {
  const home = makeCrewHome();
  const fetches: string[] = [];
  setReleaseFetcher((url) => {
    fetches.push(url);
    if (latestTag === "throw") throw new Error("simulated network failure");
    return { tag: latestTag, assets: {} };
  });
  const streams = captureStreams();
  return {
    home,
    fetches,
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

describe("maybeEmitUpdateNotice — suppression rules", () => {
  test("stderr isn't a TTY: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ stderrIsTty: false }));
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("--json: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ json: true }));
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("--quiet: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ quiet: true }));
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("command=self-update: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ command: "self-update" }));
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("command=version: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx({ command: "version" }));
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("CREW_NO_UPDATE_CHECK=1: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_NO_UPDATE_CHECK"] = "1";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("CREW_AUTOUPDATE_LOG=1 (launchd autoupdater): no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CREW_AUTOUPDATE_LOG"] = "1";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("CI=true: no fetch, no output", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CI"] = "true";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toBe("");
    expect(h.fetches).toEqual([]);
  });

  test("empty CI env var is treated as unset", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    process.env["CI"] = "";
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toContain("A new version of crew is available");
  });
});

describe("maybeEmitUpdateNotice — fetch + emission", () => {
  test("emits the notice when cached tag differs from running", () => {
    const h = makeHarness();
    writeVersionCheck("v99.99.99", h.home);
    maybeEmitUpdateNotice(h.ctx());
    expect(h.streams.stderr()).toContain("A new version of crew is available");
    expect(h.streams.stderr()).toContain("v99.99.99");
    expect(h.streams.stderr()).toContain("crew self-update");
  });

  test("no notice when cached tag matches running version", () => {
    const h = makeHarness();
    writeVersionCheck("v0.3.1", h.home);
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
    const h = makeHarness("v0.3.1");
    maybeEmitUpdateNotice(h.ctx());
    expect(h.fetches.length).toBe(1);
    expect(h.streams.stderr()).toBe("");
  });

  test("stale record + fetch succeeds: refreshes + emits against new tag", () => {
    const h = makeHarness("v99.99.99");
    // Record two days old with a stale tag
    process.env["CREW_NOW"] = "2026-04-18T00:00:00Z";
    writeVersionCheck("v0.3.1", h.home);
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
    writeVersionCheck("v0.3.1", h.home);
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
