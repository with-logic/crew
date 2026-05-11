/**
 * Tests for known-tap manifest add helpers (§16.2.1).
 */

import { describe, expect, test } from "bun:test";
import type { GitRunner } from "../../src/git/exec.ts";
import { addKnownTapSource } from "../../src/known-taps/build/add.ts";
import type { KnownTapManifest, KnownTapSource } from "../../src/known-taps/build/types.ts";

const OLD_SHA = "1111111111111111111111111111111111111111";
const NEW_SHA = "2222222222222222222222222222222222222222";

describe("addKnownTapSource", () => {
  test("adds a sorted manifest entry with defaults", () => {
    const result = addKnownTapSource(
      { version: 1, taps: [source("zeta")] },
      { name: "alpha", url: "https://github.com/example/alpha.git" },
      runnerFor(NEW_SHA),
    );

    expect(result.manifest.taps.map((tap) => tap.name)).toEqual(["alpha", "zeta"]);
    expect(result.source).toEqual({
      name: "alpha",
      url: "https://github.com/example/alpha.git",
      subpath: "",
      description: "alpha skills.",
      trust: "curated",
      commit: NEW_SHA,
      trackingRef: "main",
    });
  });

  test("honors explicit fields", () => {
    const result = addKnownTapSource(
      emptyManifest(),
      {
        name: "beta",
        url: "https://github.com/example/beta.git",
        subpath: "catalog",
        description: "Beta workflows.",
        trust: "official",
        trackingRef: "stable",
      },
      runnerFor(NEW_SHA),
    );

    expect(result.source.subpath).toBe("catalog");
    expect(result.source.description).toBe("Beta workflows.");
    expect(result.source.trust).toBe("official");
    expect(result.source.trackingRef).toBe("stable");
  });

  test("rejects duplicate names", () => {
    expect(() =>
      addKnownTapSource(
        { version: 1, taps: [source("alpha")] },
        { name: "alpha", url: "https://github.com/example/alpha.git" },
        runnerFor(NEW_SHA),
      ),
    ).toThrow("already exists");
  });
});

function emptyManifest(): KnownTapManifest {
  return { version: 1, taps: [] };
}

function source(name: string): KnownTapSource {
  return {
    name,
    url: `https://github.com/example/${name}.git`,
    subpath: "",
    description: `${name} skills`,
    trust: "curated",
    commit: OLD_SHA,
    trackingRef: "main",
  };
}

function runnerFor(sha: string): GitRunner {
  return () => ({ stdout: `${sha}\trefs/heads/main\n`, stderr: "", exitCode: 0 });
}
