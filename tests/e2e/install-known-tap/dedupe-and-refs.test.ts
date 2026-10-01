/**
 * `crew install` known-tap fallback tests (§9 / §16.2.1).
 *
 * These cases verify that install misses surface exact known-tap
 * suggestions without cloning, fetching, mutating config, or installing
 * from taps the user has not explicitly added.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { resetKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams } from "../../helpers/env.ts";
import { configuredKnownSource, homeWithKnownTaps, UNREACHABLE_TAP_URL } from "./helpers.ts";

afterEach(() => {
  resetKnownTapsForTest();
});

describe("known-tap fallback for install misses", () => {
  test("C-TAP-24 install miss preserves tap refs in suggestions", () => {
    const home = homeWithKnownTaps();
    const c = captureStreams();
    const code = runCli(["install", "auth-audit@v1"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew install supabase/auth-audit@v1");
  });

  test("C-TAP-24 configured known taps are not suggested by name or source", () => {
    const byName = homeWithKnownTaps();
    writeConfig(
      { ...readConfig(byName), taps: [{ ...configuredKnownSource(), name: "supabase" }] },
      byName,
    );
    const named = captureStreams();
    runCli(["install", "schema-review"], { home: byName, streams: named.streams });
    expect(named.stderr()).not.toContain("Homecrew found possible matches in known taps");

    const bySource = homeWithKnownTaps();
    const renamedSource = {
      ...configuredKnownSource(),
      name: "renamed",
      url: UNREACHABLE_TAP_URL,
      subpath: "",
    };
    writeConfig({ ...readConfig(bySource), taps: [renamedSource] }, bySource);
    const sourced = captureStreams();
    runCli(["install", "schema-review"], { home: bySource, streams: sourced.streams });
    expect(sourced.stderr()).not.toContain("Homecrew found possible matches in known taps");
  });

  test("malformed install refs keep the original invalid_ref error", () => {
    const home = homeWithKnownTaps();
    const c = captureStreams();
    const code = runCli(["install", "bad/name/with/too-many-parts"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).not.toContain("Homecrew found possible matches in known taps");
  });

  test("C-TAP-24 multi-ref install misses include matching known-tap suggestions", () => {
    const home = homeWithKnownTaps();
    const c = captureStreams();
    const code = runCli(["install", "schema-review", "another-missing"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("Homecrew found possible matches in known taps");
    expect(c.stderr()).toContain("crew install supabase/database/schema-review");
  });
});
