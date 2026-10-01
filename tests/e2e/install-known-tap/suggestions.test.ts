/**
 * `crew install` known-tap fallback tests (§9 / §16.2.1).
 *
 * These cases verify that install misses surface exact known-tap
 * suggestions without cloning, fetching, mutating config, or installing
 * from taps the user has not explicitly added.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { resetKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams } from "../../helpers/env.ts";
import { homeWithKnownTaps, UNREACHABLE_TAP_URL } from "./helpers.ts";

afterEach(() => {
  resetKnownTapsForTest();
});

describe("known-tap fallback for install misses", () => {
  test("C-TAP-24 bare install miss suggests an exact known-tap skill", () => {
    const home = homeWithKnownTaps();
    const c = captureStreams();
    const code = runCli(["install", "schema-review"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("Homecrew found possible matches in known taps");
    expect(c.stderr()).toContain("Add the tap:");
    expect(c.stderr()).toContain(`crew tap add ${UNREACHABLE_TAP_URL} supabase`);
    expect(c.stderr()).toContain("Then install:");
    expect(c.stderr()).toContain("crew install supabase/database/schema-review");
    expect(readConfig(home).taps).toEqual([]);
  });

  test("C-TAP-24 JSON errors include known_tap_suggestions", () => {
    const home = homeWithKnownTaps();
    const c = captureStreams();
    const code = runCli(["install", "--json", "database/schema-review"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    const parsed = JSON.parse(c.stdout()) as {
      error: { details: { known_tap_suggestions: unknown[] } };
    };
    expect(parsed.error.details.known_tap_suggestions).toEqual([
      {
        tap: "supabase",
        url: UNREACHABLE_TAP_URL,
        subpath: "skills",
        trust: "curated",
        name: "schema-review",
        namespace: "database",
        description: "Review SQL migrations and RLS policies.",
        tap_add: `crew tap add ${UNREACHABLE_TAP_URL} supabase`,
        install: "crew install supabase/database/schema-review",
      },
    ]);
  });

  test("C-TAP-24 qualified known-tap install misses suggest qualified install refs", () => {
    const home = homeWithKnownTaps();
    const tapSkill = captureStreams();
    const tapSkillCode = runCli(["install", "supabase/schema-review"], {
      home,
      streams: tapSkill.streams,
    });
    expect(tapSkillCode).toBe(4);
    expect(tapSkill.stderr()).toContain("crew install supabase/database/schema-review");

    const threeSegment = captureStreams();
    const threeSegmentCode = runCli(["install", "supabase/database/schema-review"], {
      home,
      streams: threeSegment.streams,
    });
    expect(threeSegmentCode).toBe(4);
    expect(threeSegment.stderr()).toContain("crew install supabase/database/schema-review");
  });

  test("C-TAP-24 known tap-name misses suggest adding and installing the tap", () => {
    const home = homeWithKnownTaps();
    const c = captureStreams();
    const code = runCli(["install", "--json", "supabase"], { home, streams: c.streams });
    expect(code).toBe(4);
    const parsed = JSON.parse(c.stdout()) as {
      error: { details: { known_tap_suggestions: unknown[] } };
    };
    expect(parsed.error.details.known_tap_suggestions).toEqual([
      {
        tap: "supabase",
        url: UNREACHABLE_TAP_URL,
        subpath: "skills",
        trust: "curated",
        name: null,
        namespace: null,
        description: "Supabase workflows.",
        tap_add: `crew tap add ${UNREACHABLE_TAP_URL} supabase`,
        install: "crew install supabase",
      },
    ]);
  });
});
