/**
 * Tests for the version-check record (§10.4).
 *
 * Covers the 24h staleness gate, the notice renderer, and the
 * read/write round-trip. Everything here is pure — no network, no
 * spawning, no real filesystem beyond `tmpdir()`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { paths } from "../../src/core/paths.ts";
import { CREW_VERSION } from "../../src/core/version.ts";
import {
  isStale,
  noticeFor,
  readVersionCheck,
  VERSION_CHECK_INTERVAL_MS,
  writeVersionCheck,
} from "../../src/self-update/check.ts";
import { makeCrewHome } from "../helpers/env.ts";

const savedNow = process.env["CREW_NOW"];

beforeEach(() => {
  process.env["CREW_NOW"] = "2026-04-20T12:00:00Z";
});

afterEach(() => {
  if (savedNow === undefined) delete process.env["CREW_NOW"];
  else process.env["CREW_NOW"] = savedNow;
});

describe("version-check record", () => {
  test("writeVersionCheck + readVersionCheck round-trip", () => {
    const home = makeCrewHome();
    writeVersionCheck("v9.9.9", home);
    expect(existsSync(paths(home).versionCheckFile)).toBe(true);
    const record = readVersionCheck(home);
    expect(record).toEqual({ checked_at: "2026-04-20T12:00:00Z", latest_tag: "v9.9.9" });
    // On-disk format: two-space indent + trailing newline (util/json).
    const contents = readFileSync(paths(home).versionCheckFile, "utf8");
    expect(contents).toBe(`{
  "checked_at": "2026-04-20T12:00:00Z",
  "latest_tag": "v9.9.9"
}
`);
  });

  test("readVersionCheck returns null when file is absent", () => {
    expect(readVersionCheck(makeCrewHome())).toBeNull();
  });
});

describe("isStale", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  test("stale when no record", () => {
    expect(isStale(now, null)).toBe(true);
  });

  test("stale when unparseable timestamp", () => {
    expect(isStale(now, { checked_at: "not-a-date", latest_tag: "v1" })).toBe(true);
  });

  test("fresh inside the 24h window", () => {
    const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(isStale(now, { checked_at: anHourAgo, latest_tag: "v1" })).toBe(false);
  });

  test("stale exactly at the 24h boundary", () => {
    const edge = new Date(now.getTime() - VERSION_CHECK_INTERVAL_MS).toISOString();
    expect(isStale(now, { checked_at: edge, latest_tag: "v1" })).toBe(true);
  });

  test("stale past the 24h boundary", () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * VERSION_CHECK_INTERVAL_MS).toISOString();
    expect(isStale(now, { checked_at: twoDaysAgo, latest_tag: "v1" })).toBe(true);
  });

  test("honors a custom interval", () => {
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    // With a 1h interval, fifteen minutes is still fresh.
    expect(isStale(now, { checked_at: fifteenMinAgo, latest_tag: "v1" }, 60 * 60 * 1000)).toBe(
      false,
    );
    // With a 5min interval, fifteen minutes is stale.
    expect(isStale(now, { checked_at: fifteenMinAgo, latest_tag: "v1" }, 5 * 60 * 1000)).toBe(true);
  });
});

describe("noticeFor", () => {
  test("null when no record", () => {
    expect(noticeFor(null)).toBeNull();
  });

  test("null when latest tag equals running version", () => {
    const sameTag = `v${CREW_VERSION}`;
    expect(noticeFor({ checked_at: "2026-04-20T12:00:00Z", latest_tag: sameTag })).toBeNull();
  });

  test("null when latest tag equals running version, tagless form", () => {
    expect(noticeFor({ checked_at: "2026-04-20T12:00:00Z", latest_tag: CREW_VERSION })).toBeNull();
  });

  test("null when latest tag is empty", () => {
    expect(noticeFor({ checked_at: "2026-04-20T12:00:00Z", latest_tag: "" })).toBeNull();
  });

  test("renders the notice when versions differ", () => {
    const notice = noticeFor({ checked_at: "2026-04-20T12:00:00Z", latest_tag: "v99.99.99" });
    expect(notice).toBe(
      `A new version of Homecrew is available (v${CREW_VERSION} → v99.99.99). Run \`crew self-update\` to upgrade.`,
    );
  });
});
