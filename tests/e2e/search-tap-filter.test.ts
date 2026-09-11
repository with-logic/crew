/**
 * `crew search --tap <name>` (§16.6, C-TAP-23a).
 *
 * Two local taps share a skill name; `--tap` must narrow both the query
 * form and the no-query catalog to the named tap, drop known-tap
 * suggestions, and surface the filter in JSON. An unknown tap name is a
 * usage error, not an empty result.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../src/known-taps/registry.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

afterEach(() => {
  resetKnownTapsForTest();
});

const KNOWN: readonly KnownTap[] = [
  {
    name: "vendor",
    url: "https://github.com/example/vendor-skills.git",
    subpath: "",
    description: "Vendor workflows.",
    trust: "curated",
    skills: [
      { name: "alpha-vendor", namespace: null, description: "Vendor alpha.", path: "alpha-vendor" },
    ],
  },
];

function makeTap(prefix: string, skills: readonly { name: string; desc: string }[]): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const s of skills) {
    makeSkill(repo, s.name, skillFrontmatter({ name: s.name, description: s.desc }));
  }
  commitAll(repo, "init");
  return repo;
}

/** Fresh home with `core` swapped for two local taps that both hold `alpha`. */
function setupTwoTaps(): string {
  const home = makeCrewHome();
  const quiet = () => captureStreams().streams;
  runCli(["tap", "remove", "core", "--force"], { home, streams: quiet() });
  const repoA = makeTap("crew-stf-a-", [
    { name: "alpha", desc: "Alpha from A" },
    { name: "gamma", desc: "Gamma only in A" },
  ]);
  const repoB = makeTap("crew-stf-b-", [{ name: "alpha", desc: "Alpha from B" }]);
  runCli(["tap", "add", `file://${repoA}`, "tap-a"], { home, streams: quiet() });
  runCli(["tap", "add", `file://${repoB}`, "tap-b"], { home, streams: quiet() });
  return home;
}

describe("crew search --tap", () => {
  test("C-TAP-23a --tap narrows a query to one tap and drops known-tap suggestions", () => {
    setKnownTapsForTest(KNOWN);
    const home = setupTwoTaps();

    const all = captureStreams();
    expect(runCli(["search", "alpha"], { home, streams: all.streams })).toBe(0);
    expect(all.stdout()).toContain('2 matches for "alpha"');
    expect(all.stdout()).toContain("Trusted taps you can add");

    const one = captureStreams();
    expect(runCli(["search", "--tap", "tap-b", "alpha"], { home, streams: one.streams })).toBe(0);
    const out = one.stdout();
    expect(out).toContain('1 match for "alpha"');
    expect(out).toContain("  tap-b");
    expect(out).not.toContain("  tap-a");
    expect(out).toContain("Alpha from B");
    expect(out).not.toContain("Alpha from A");
    expect(out).not.toContain("Trusted taps you can add");
  });

  test("C-TAP-23a --tap with no query lists only that tap's catalog", () => {
    const home = setupTwoTaps();
    const c = captureStreams();
    expect(runCli(["search", "--tap", "tap-a"], { home, streams: c.streams })).toBe(0);
    const out = c.stdout();
    expect(out).toContain("2 skills available");
    expect(out).toContain("gamma");
    expect(out).toContain("Alpha from A");
    expect(out).not.toContain("Alpha from B");
  });

  test("C-TAP-23a --tap value does not swallow the query and JSON reports the tap", () => {
    setKnownTapsForTest(KNOWN);
    const home = setupTwoTaps();
    const c = captureStreams();
    expect(
      runCli(["search", "--tap", "tap-a", "alpha", "--json"], { home, streams: c.streams }),
    ).toBe(0);
    const payload = JSON.parse(c.stdout()) as {
      tap: string | null;
      hits: { tap: string; name: string }[];
      known_hits: unknown[];
    };
    expect(payload.tap).toBe("tap-a");
    expect(payload.hits.map((h) => `${h.tap}/${h.name}`)).toEqual(["tap-a/alpha"]);
    expect(payload.known_hits).toEqual([]);

    const plain = captureStreams();
    expect(runCli(["search", "alpha", "--json"], { home, streams: plain.streams })).toBe(0);
    const unscoped = JSON.parse(plain.stdout()) as { tap: string | null; known_hits: unknown[] };
    expect(unscoped.tap).toBeNull();
    expect(unscoped.known_hits.length).toBe(1);
  });

  test("C-TAP-23a unknown --tap name is a usage_error pointing at `crew tap list`", () => {
    const home = setupTwoTaps();
    const c = captureStreams();
    expect(runCli(["search", "--tap", "nope", "alpha"], { home, streams: c.streams })).toBe(4);
    const err = c.stderr();
    expect(err).toContain("usage_error");
    expect(err).toContain("`nope` was not found in your list of taps");
    expect(err).toContain("crew tap list");
  });
});
