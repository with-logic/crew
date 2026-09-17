/**
 * The post-command update notice as seen through the CLI (§17.3).
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { CREW_VERSION } from "../../../src/core/version.ts";
import { writeVersionCheck } from "../../../src/self-update/check.ts";
import { resetAssetDownloader, resetXattrClearer } from "../../../src/self-update/download.ts";
import { resetReleaseFetcher, setReleaseFetcher } from "../../../src/self-update/github.ts";
import { resetReleaseSignatureVerifier } from "../../../src/self-update/signature.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

// Force darwin for deterministic asset names in the happy-path tests.
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
  resetReleaseSignatureVerifier();
});

const RUNNING_TAG = `v${CREW_VERSION}`;

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
    expect(cap.stderr()).toContain("Error");
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
