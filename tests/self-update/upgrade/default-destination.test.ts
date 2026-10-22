/** Default self-update replacement uses the running executable path (§10.3). */

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readVersionCheck } from "../../../src/self-update/check.ts";
import { resetAssetDownloader, resetXattrClearer } from "../../../src/self-update/download.ts";
import { resetReleaseFetcher } from "../../../src/self-update/github.ts";
import { resetReleaseSignatureVerifier } from "../../../src/self-update/signature.ts";
import { runSelfUpdate } from "../../../src/self-update/upgrade.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { captureDownload } from "./helpers.ts";

afterEach(() => {
  resetAssetDownloader();
  resetXattrClearer();
  resetReleaseFetcher();
  resetReleaseSignatureVerifier();
});

test("default destination replaces an owned executable without overrides", () => {
  const home = makeCrewHome();
  const dest = join(home, "crew-bin");
  writeFileSync(dest, "OLD");
  const captured = captureDownload();
  const originalExecPath = Object.getOwnPropertyDescriptor(process, "execPath")!;
  const originalEnv = process.env;
  try {
    // Keep default-path replacement scoped to this fixture, including on regressions.
    Object.defineProperty(process, "execPath", { value: dest, configurable: true });
    process.env = { ...originalEnv };
    delete process.env["CREW_SELF_UPDATE_TARGET"];
    const result = runSelfUpdate({ home, force: true });
    expect(result.replaced).toBe(true);
    expect(result.latestTag).toBe("v99.99.99");
    expect(readFileSync(dest, "utf8")).toBe("NEW");
    expect(readVersionCheck(home)?.latest_tag).toBe("v99.99.99");
    expect(existsSync(dirname(captured.assetPath))).toBe(false);
  } finally {
    Object.defineProperty(process, "execPath", originalExecPath);
    process.env = originalEnv;
  }
  expect(Object.getOwnPropertyDescriptor(process, "execPath")).toEqual(originalExecPath);
  expect(process.env).toBe(originalEnv);
});
