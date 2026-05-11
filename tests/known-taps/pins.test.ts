/**
 * Tests for known-tap pin refresh helpers (§16.2.1).
 */

import { describe, expect, test } from "bun:test";
import type { GitRunner } from "../../src/git/exec.ts";
import { resolveTrackingRef, updateKnownTapPins } from "../../src/known-taps/build/pins.ts";
import type { KnownTapManifest, KnownTapSource } from "../../src/known-taps/build/types.ts";

const OLD_SHA = "1111111111111111111111111111111111111111";
const NEW_SHA = "2222222222222222222222222222222222222222";

describe("updateKnownTapPins", () => {
  test("updates selected taps from tracking refs", () => {
    const result = updateKnownTapPins(manifest(), ["alpha"], runnerFor(NEW_SHA));

    expect(result.manifest.taps.map((tap) => tap.commit)).toEqual([NEW_SHA, OLD_SHA, OLD_SHA]);
    expect(result.updates).toEqual([
      { name: "alpha", trackingRef: "main", from: OLD_SHA, to: NEW_SHA },
    ]);
  });

  test("--all updates only taps with tracking refs", () => {
    const result = updateKnownTapPins(manifest(), "all", runnerFor(NEW_SHA));

    expect(result.manifest.taps.map((tap) => tap.commit)).toEqual([NEW_SHA, NEW_SHA, OLD_SHA]);
    expect(result.updates.map((update) => update.name)).toEqual(["alpha", "beta"]);
  });

  test("rejects unknown names and taps without tracking refs", () => {
    expect(() => updateKnownTapPins(manifest(), ["missing"], runnerFor(NEW_SHA))).toThrow(
      "unknown known tap",
    );
    expect(() => updateKnownTapPins(manifest(), ["static"], runnerFor(NEW_SHA))).toThrow(
      "has no trackingRef",
    );
  });
});

describe("resolveTrackingRef", () => {
  test("accepts an already-pinned SHA", () => {
    expect(resolveTrackingRef("ignored", NEW_SHA, runnerFor(OLD_SHA))).toBe(NEW_SHA);
  });

  test("tries branch and peeled tag ref forms", () => {
    const calls: string[] = [];
    const runner: GitRunner = (args) => {
      calls.push(args[2]!);
      if (args[2] === "refs/tags/v1^{}") {
        return { stdout: `${NEW_SHA}\trefs/tags/v1^{}\n`, stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    expect(resolveTrackingRef("repo", "v1", runner)).toBe(NEW_SHA);
    expect(calls).toEqual(["refs/heads/v1", "refs/tags/v1^{}"]);
  });

  test("reports missing and unreachable refs", () => {
    expect(() => resolveTrackingRef("repo", "main", () => emptyGitResult())).toThrow(
      "couldn't find tracking ref",
    );
    expect(() =>
      resolveTrackingRef("repo", "main", () => ({
        stdout: "",
        stderr: "nope",
        exitCode: 128,
      })),
    ).toThrow("couldn't resolve");
  });
});

function manifest(): KnownTapManifest {
  return {
    version: 1,
    taps: [source("alpha", "main"), source("beta", "stable"), source("static", undefined)],
  };
}

function source(name: string, trackingRef: string | undefined): KnownTapSource {
  return {
    name,
    url: `https://github.com/example/${name}.git`,
    subpath: "",
    description: `${name} skills`,
    trust: "curated",
    commit: OLD_SHA,
    ...(trackingRef === undefined ? {} : { trackingRef }),
  };
}

function runnerFor(sha: string): GitRunner {
  return () => ({ stdout: `${sha}\trefs/heads/main\n`, stderr: "", exitCode: 0 });
}

function emptyGitResult(): ReturnType<GitRunner> {
  return { stdout: "", stderr: "", exitCode: 0 };
}
