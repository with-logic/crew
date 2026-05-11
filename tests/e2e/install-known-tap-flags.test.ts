/**
 * Known-tap install fallback disambiguation flag tests (§8.3 / §9).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
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
    ],
  },
];

afterEach(() => {
  resetKnownTapsForTest();
});

describe("known-tap install fallback with disambiguation flags", () => {
  test("C-TAP-24 --tap does not suggest known skills", () => {
    const c = runWithKnownTaps(["install", "--tap", "schema-review"]);
    expect(c.code).toBe(4);
    expect(c.stderr).toContain("`schema-review` is not a tap");
    expect(c.stderr).not.toContain("Homecrew found possible matches in known taps");
  });

  test("C-TAP-24 --skill does not suggest whole known taps", () => {
    const c = runWithKnownTaps(["install", "--skill", "supabase"]);
    expect(c.code).toBe(4);
    expect(c.stderr).toContain("`supabase` is not a skill");
    expect(c.stderr).not.toContain("Homecrew found possible matches in known taps");
  });

  test("C-TAP-24 --bundle suppresses known skill and tap suggestions", () => {
    const skill = runWithKnownTaps(["install", "--bundle", "schema-review"]);
    expect(skill.code).toBe(4);
    expect(skill.stderr).not.toContain("Homecrew found possible matches in known taps");

    const tap = runWithKnownTaps(["install", "--bundle", "supabase"]);
    expect(tap.code).toBe(4);
    expect(tap.stderr).not.toContain("Homecrew found possible matches in known taps");
  });
});

function runWithKnownTaps(args: readonly string[]): {
  readonly code: number;
  readonly stderr: string;
} {
  const home = makeCrewHome();
  setKnownTapsForTest(KNOWN_TAPS);
  const setupStreams = captureStreams();
  runCli(["tap", "remove", "core", "--force"], { home, streams: setupStreams.streams });
  const c = captureStreams();
  const code = runCli(args, { home, streams: c.streams });
  return { code, stderr: c.stderr() };
}
