/**
 * runSelfUpdate happy paths (§17.2): download, verify, swap, and the
 * version-check refresh; plus runSelfUpdateCheck.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../../../src/core/paths.ts";
import { CREW_VERSION } from "../../../src/core/version.ts";
import { readVersionCheck } from "../../../src/self-update/check.ts";
import {
  resetAssetDownloader,
  resetXattrClearer,
  setAssetDownloader,
  setXattrClearer,
} from "../../../src/self-update/download.ts";
import { resetReleaseFetcher, setReleaseFetcher } from "../../../src/self-update/github.ts";
import {
  resetReleaseSignatureVerifier,
  setReleaseSignatureVerifier,
} from "../../../src/self-update/signature.ts";
import { runSelfUpdate, runSelfUpdateCheck } from "../../../src/self-update/upgrade.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { downloaderForBinary, releaseAssets } from "../helpers.ts";

// Force `process.platform === "darwin"` for deterministic asset names.
// The dedicated "platform guard" test below flips to an unsupported
// platform for that one case.
const originalPlatform = process.platform;
beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
});
afterAll(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  resetReleaseFetcher();
  resetAssetDownloader();
  resetXattrClearer();
  resetReleaseSignatureVerifier();
});

describe("runSelfUpdate", () => {
  test("downloads + swaps + refreshes version-check when newer", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: releaseAssets(),
    }));
    setAssetDownloader(downloaderForBinary("NEW"));
    setReleaseSignatureVerifier(() => true);
    setXattrClearer(() => {});

    const result = runSelfUpdate({ home, force: false, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(result.latestTag).toBe("v99.99.99");
    expect(readFileSync(dest, "utf8")).toBe("NEW");

    const record = readVersionCheck(home);
    expect(record?.latest_tag).toBe("v99.99.99");
    expect(existsSync(paths(home).versionCheckFile)).toBe(true);
  });

  test("downloads the Linux release asset on Linux hosts", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: releaseAssets(),
    }));
    setAssetDownloader(downloaderForBinary("LINUX"));
    setReleaseSignatureVerifier(() => true);
    setXattrClearer(() => {});

    const result = runSelfUpdate({ home, force: false, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("LINUX");
  });

  test("no-op when already on latest, but still refreshes version-check", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "CURRENT");

    // Stub a release that matches the running CREW_VERSION.
    setReleaseFetcher(() => ({
      tag: `v${CREW_VERSION}`,
      assets: releaseAssets(),
    }));
    let downloaderCalled = false;
    setAssetDownloader(() => {
      downloaderCalled = true;
    });

    const result = runSelfUpdate({ home, force: false, execPath: dest });
    expect(result.replaced).toBe(false);
    expect(downloaderCalled).toBe(false);
    expect(readFileSync(dest, "utf8")).toBe("CURRENT");

    const record = readVersionCheck(home);
    expect(record?.latest_tag).toBe(`v${CREW_VERSION}`);
  });

  test("--force reinstalls even when already on latest", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "CURRENT");

    setReleaseFetcher(() => ({
      tag: `v${CREW_VERSION}`,
      assets: releaseAssets(),
    }));
    setAssetDownloader(downloaderForBinary("FORCED"));
    setReleaseSignatureVerifier(() => true);
    setXattrClearer(() => {});

    const result = runSelfUpdate({ home, force: true, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("FORCED");
  });
});
describe("runSelfUpdateCheck", () => {
  test("writes the record and returns the latest tag", () => {
    const home = makeCrewHome();
    setReleaseFetcher(() => ({ tag: "v99.99.99", assets: {} }));

    const result = runSelfUpdateCheck(home);
    expect(result.latestTag).toBe("v99.99.99");
    expect(readVersionCheck(home)?.latest_tag).toBe("v99.99.99");
  });

  test("check against an explicit tag goes to /releases/tags/<tag>", () => {
    const home = makeCrewHome();
    let requestedUrl = "";
    setReleaseFetcher((url) => {
      requestedUrl = url;
      return { tag: "v0.5.0", assets: {} };
    });
    runSelfUpdateCheck(home, "v0.5.0");
    expect(requestedUrl).toContain("/releases/tags/v0.5.0");
  });
});
