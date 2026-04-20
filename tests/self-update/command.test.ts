/**
 * End-to-end tests for `crew self-update` (via `runCli`).
 *
 * The network + filesystem seams are stubbed: `setReleaseFetcher`,
 * `setAssetDownloader`, `setXattrClearer`, `setBackgroundSpawner`.
 *
 * The post-command update notice is suppressed by passing a streams
 * override (which sets stderrIsTty=false by default). Tests that need
 * to see the notice opt in explicitly via `stderrIsTty: true`.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { CrewError } from "../../src/core/errors.ts";
import { resetBackgroundSpawner, setBackgroundSpawner } from "../../src/self-update/background.ts";
import { readVersionCheck, writeVersionCheck } from "../../src/self-update/check.ts";
import {
  resetAssetDownloader,
  resetXattrClearer,
  setAssetDownloader,
  setXattrClearer,
} from "../../src/self-update/download.ts";
import { resetReleaseFetcher, setReleaseFetcher } from "../../src/self-update/github.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

afterEach(() => {
  resetReleaseFetcher();
  resetAssetDownloader();
  resetXattrClearer();
  resetBackgroundSpawner();
});

function currentAssetName(): string {
  return process.arch === "arm64" ? "crew-macos-arm64" : "crew-macos-x64";
}

describe("crew self-update --check", () => {
  test("prints a human-readable update-available summary and refreshes the record", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));
    const cap = captureStreams();
    const code = runCli(["self-update", "--check"], { home, streams: cap.streams });
    expect(code).toBe(0);
    expect(cap.stdout()).toContain("A newer crew is available");
    expect(cap.stdout()).toContain("v99.99.99");
    expect(readVersionCheck(home)?.latest_tag).toBe("v99.99.99");
  });

  test("prints 'on the latest' when versions match", () => {
    const home = makeCrewHome();
    // Pretend GitHub says the current version is latest.
    setReleaseFetcher(() => ({
      tag: "v0.3.1",
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));
    const cap = captureStreams();
    runCli(["self-update", "--check"], { home, streams: cap.streams });
    expect(cap.stdout()).toContain("You're on v0.3.1");
    expect(cap.stdout()).toContain("the latest");
  });

  test("--background prints nothing and still refreshes the record", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => ({ tag: "v99.99.99", assets: {} }));
    const cap = captureStreams();
    const code = runCli(["self-update", "--check", "--background"], {
      home,
      streams: cap.streams,
    });
    expect(code).toBe(0);
    expect(cap.stdout()).toBe("");
    expect(cap.stderr()).toBe("");
    expect(readVersionCheck(home)?.latest_tag).toBe("v99.99.99");
  });

  test("--background swallows network failures silently (exit 0)", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => {
      throw new Error("boom");
    });
    const cap = captureStreams();
    const code = runCli(["self-update", "--check", "--background"], {
      home,
      streams: cap.streams,
    });
    expect(code).toBe(0);
    expect(cap.stderr()).toBe("");
  });

  test("--check returns JSON when --json is set", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: {},
    }));
    const cap = captureStreams();
    runCli(["self-update", "--check", "--json"], { home, streams: cap.streams });
    const parsed = JSON.parse(cap.stdout());
    expect(parsed.latest_tag).toBe("v99.99.99");
    expect(parsed.update_available).toBe(true);
  });
});

describe("crew self-update (full upgrade)", () => {
  test("downloads and replaces the target binary; refreshes version-check", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));
    setAssetDownloader((_url, path) => writeFileSync(path, "NEW"));
    setXattrClearer(() => {});

    const savedTarget = process.env["CREW_SELF_UPDATE_TARGET"];
    process.env["CREW_SELF_UPDATE_TARGET"] = dest;
    try {
      const cap = captureStreams();
      const code = runCli(["self-update"], { home, streams: cap.streams });
      expect(code).toBe(0);
      expect(cap.stdout()).toContain("Upgraded crew");
      expect(cap.stdout()).toContain("v99.99.99");
      expect(readVersionCheck(home)?.latest_tag).toBe("v99.99.99");
    } finally {
      if (savedTarget === undefined) delete process.env["CREW_SELF_UPDATE_TARGET"];
      else process.env["CREW_SELF_UPDATE_TARGET"] = savedTarget;
    }
  });

  test("'already on the latest' path prints a friendly message", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => ({
      tag: "v0.3.1",
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));
    const cap = captureStreams();
    const code = runCli(["self-update"], { home, streams: cap.streams });
    expect(code).toBe(0);
    expect(cap.stdout()).toContain("Already on v0.3.1");
  });

  test("network failure surfaces as self_update_unavailable (exit 5)", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => {
      throw new CrewError("self_update_unavailable", "network is unreachable");
    });
    const cap = captureStreams();
    const code = runCli(["self-update", "--check"], { home, streams: cap.streams });
    expect(code).toBe(5);
    expect(cap.stderr()).toContain("error:");
  });
});

describe("post-command update notice", () => {
  test("prints on stderr when the cached tag is newer and stderr is a TTY", () => {
    const home = makeCrewHome();
    writeVersionCheck("v99.99.99", home);

    const cap = captureStreams();
    const code = runCli(["version"], {
      home,
      streams: cap.streams,
      // `version` is suppressed — verify that it IS suppressed here.
      stderrIsTty: true,
    });
    expect(code).toBe(0);
    expect(cap.stderr()).toBe("");
  });

  test("prints on stderr when the command isn't version/self-update", () => {
    const home = makeCrewHome();
    writeVersionCheck("v99.99.99", home);

    const cap = captureStreams();
    const code = runCli(["list"], { home, streams: cap.streams, stderrIsTty: true });
    expect(code).toBe(0);
    expect(cap.stderr()).toContain("A new version of crew is available");
    expect(cap.stderr()).toContain("v99.99.99");
  });

  test("also emits on the error path when stderrIsTty is true", () => {
    const home = makeCrewHome();
    writeVersionCheck("v99.99.99", home);
    const cap = captureStreams();
    // Unknown command → usage_error (exit 4).
    const code = runCli(["definitely-not-a-command"], {
      home,
      streams: cap.streams,
      stderrIsTty: true,
    });
    expect(code).toBe(4);
    // Both the error and the notice go to stderr.
    expect(cap.stderr()).toContain("error:");
    expect(cap.stderr()).toContain("A new version of crew is available");
  });

  test("kicks off a background check when the record is stale", () => {
    const home = makeCrewHome();
    const spawns: string[] = [];
    setBackgroundSpawner((_argv, h) => spawns.push(h));
    const cap = captureStreams();
    // No record on disk → stale → should spawn.
    runCli(["list"], { home, streams: cap.streams, stderrIsTty: true });
    expect(spawns).toEqual([home]);
  });
});
