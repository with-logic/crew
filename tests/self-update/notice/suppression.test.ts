/**
 * maybeEmitUpdateNotice suppression rules (§17.3): when the post-command
 * notice must stay silent.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeVersionCheck } from "../../../src/self-update/check.ts";
import { resetReleaseFetcher } from "../../../src/self-update/github.ts";
import { maybeEmitUpdateNotice } from "../../../src/self-update/notice.ts";

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
    expect(h.streams.stderr()).toContain("A new version of Homecrew is available");
  });
});
