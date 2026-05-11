/**
 * `crew install` known-tap fallback tests (§9 / §16.2.1).
 *
 * These cases verify that install misses surface exact known-tap
 * suggestions without cloning, fetching, mutating config, or installing
 * from taps the user has not explicitly added.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../src/known-taps/registry.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const KNOWN_TAPS: readonly KnownTap[] = [
  {
    name: "supabase",
    url: "https://github.com/example/supabase-skills.git",
    subpath: "skills",
    description: "Supabase workflows.",
    trust: "curated",
    skills: [
      {
        name: "schema-review",
        namespace: "database",
        description: "Review SQL migrations and RLS policies.",
        path: "database/schema-review",
      },
      {
        name: "auth-audit",
        namespace: null,
        description: "Audit auth flows.",
        path: "auth-audit",
      },
    ],
  },
];

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
    expect(c.stderr()).toContain(
      "crew tap add https://github.com/example/supabase-skills supabase",
    );
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
        url: "https://github.com/example/supabase-skills.git",
        subpath: "skills",
        trust: "curated",
        name: "schema-review",
        namespace: "database",
        description: "Review SQL migrations and RLS policies.",
        tap_add: "crew tap add https://github.com/example/supabase-skills supabase",
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
        url: "https://github.com/example/supabase-skills.git",
        subpath: "skills",
        trust: "curated",
        name: null,
        namespace: null,
        description: "Supabase workflows.",
        tap_add: "crew tap add https://github.com/example/supabase-skills supabase",
        install: "crew install supabase",
      },
    ]);
  });

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
    writeConfig(
      { ...readConfig(bySource), taps: [{ ...configuredKnownSource(), name: "renamed" }] },
      bySource,
    );
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

function homeWithKnownTaps(): string {
  const home = makeCrewHome();
  setKnownTapsForTest(KNOWN_TAPS);
  const setupStreams = captureStreams();
  // Keep configured taps empty so suggestions can only come from the known registry fixture.
  runCli(["tap", "remove", "core", "--force"], { home, streams: setupStreams.streams });
  return home;
}

function configuredKnownSource() {
  return {
    kind: "git" as const,
    registered: true,
    url: "https://github.com/example/supabase-skills.git",
    subpath: "skills",
    path: "",
  };
}
