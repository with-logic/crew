/**
 * End-to-end tests for `crew self-update` (via `runCli`).
 *
 * The network + filesystem seams are stubbed: `setReleaseFetcher`,
 * `setAssetDownloader`, `setXattrClearer`.
 *
 * The post-command update notice is suppressed by passing a streams
 * override (which sets stderrIsTty=false by default). Tests that need
 * to see the notice opt in explicitly via `stderrIsTty: true`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { CrewError } from "../../src/core/errors.ts";
import { CREW_VERSION } from "../../src/core/version.ts";
import { readVersionCheck, writeVersionCheck } from "../../src/self-update/check.ts";
import {
  resetAssetDownloader,
  resetXattrClearer,
  setAssetDownloader,
  setXattrClearer,
} from "../../src/self-update/download.ts";
import { resetReleaseFetcher, setReleaseFetcher } from "../../src/self-update/github.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

// Force darwin for the happy-path tests — `runSelfUpdate`'s platform
// guard rejects non-macOS hosts. Without this override every test in
// this file would fail on a Linux CI runner.
const originalPlatform = process.platform;
// Also clear the notice-suppression env vars so that on a CI runner
// (where `CI` is set) the post-command update notice still fires —
// otherwise the tests below would see suppression instead of the
// notice they're asserting on.
const savedEnv = {
  CI: process.env["CI"],
  CREW_NO_UPDATE_CHECK: process.env["CREW_NO_UPDATE_CHECK"],
  CREW_AUTOUPDATE_LOG: process.env["CREW_AUTOUPDATE_LOG"],
};
beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  delete process.env["CI"];
  delete process.env["CREW_NO_UPDATE_CHECK"];
  delete process.env["CREW_AUTOUPDATE_LOG"];
});
afterAll(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

afterEach(() => {
  resetReleaseFetcher();
  resetAssetDownloader();
  resetXattrClearer();
});

function currentAssetName(): string {
  return process.arch === "arm64" ? "crew-macos-arm64" : "crew-macos-x64";
}

const RUNNING_TAG = `v${CREW_VERSION}`;

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
    expect(cap.stdout()).toContain("A newer Homecrew is available");
    expect(cap.stdout()).toContain("v99.99.99");
    expect(readVersionCheck(home)?.latest_tag).toBe("v99.99.99");
  });

  test("prints 'on the latest' when versions match", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => ({
      tag: RUNNING_TAG,
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));
    const cap = captureStreams();
    runCli(["self-update", "--check"], { home, streams: cap.streams });
    expect(cap.stdout()).toContain(`You're on ${RUNNING_TAG}`);
    expect(cap.stdout()).toContain("the latest");
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
      expect(cap.stdout()).toContain("Upgraded Homecrew");
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
      tag: RUNNING_TAG,
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));
    const cap = captureStreams();
    const code = runCli(["self-update"], { home, streams: cap.streams });
    expect(code).toBe(0);
    expect(cap.stdout()).toContain(`Already on ${RUNNING_TAG}`);
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
  test("suppressed for `crew version` even with a cached newer tag", () => {
    const home = makeCrewHome();
    writeVersionCheck("v99.99.99", home);
    const cap = captureStreams();
    const code = runCli(["version"], {
      home,
      streams: cap.streams,
      stderrIsTty: true,
    });
    expect(code).toBe(0);
    expect(cap.stderr()).toBe("");
  });

  test("emits on stderr for normal commands when a newer tag is cached", () => {
    const home = makeCrewHome();
    writeVersionCheck("v99.99.99", home);
    const cap = captureStreams();
    const code = runCli(["list"], { home, streams: cap.streams, stderrIsTty: true });
    expect(code).toBe(0);
    expect(cap.stderr()).toContain("A new version of Homecrew is available");
    expect(cap.stderr()).toContain("v99.99.99");
  });

  test("also emits on the error path when stderrIsTty is true", () => {
    const home = makeCrewHome();
    writeVersionCheck("v99.99.99", home);
    const cap = captureStreams();
    const code = runCli(["definitely-not-a-command"], {
      home,
      streams: cap.streams,
      stderrIsTty: true,
    });
    expect(code).toBe(4);
    expect(cap.stderr()).toContain("error:");
    expect(cap.stderr()).toContain("A new version of Homecrew is available");
  });

  test("performs a synchronous fetch when the record is stale", () => {
    const home = makeCrewHome();
    const fetches: string[] = [];
    setReleaseFetcher((url) => {
      fetches.push(url);
      return { tag: RUNNING_TAG, assets: {} };
    });
    const cap = captureStreams();
    // No record on disk → stale → should trigger one fetch.
    runCli(["list"], { home, streams: cap.streams, stderrIsTty: true });
    expect(fetches.length).toBe(1);
    expect(fetches[0]).toBe("https://crew.logic.inc/latest-version.json");
  });
});
