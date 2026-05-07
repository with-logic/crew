/**
 * Tests for the self-update orchestration (§10.3 steps 1-6).
 *
 * Everything upstream of `runSelfUpdate` is stubbed: the release feed,
 * the binary download, and the xattr call. The test verifies the
 * sequencing and the final state (bytes at dest, version-check record
 * refreshed, error shapes on failure).
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../../src/core/paths.ts";
import { CREW_VERSION } from "../../src/core/version.ts";
import { readVersionCheck } from "../../src/self-update/check.ts";
import {
  resetAssetDownloader,
  resetXattrClearer,
  setAssetDownloader,
  setXattrClearer,
} from "../../src/self-update/download.ts";
import { resetReleaseFetcher, setReleaseFetcher } from "../../src/self-update/github.ts";
import { runSelfUpdate, runSelfUpdateCheck } from "../../src/self-update/upgrade.ts";
import { makeCrewHome } from "../helpers/env.ts";
import {
  checksumTextFor,
  currentAssetName,
  downloaderForBinary,
  releaseAssets,
} from "./helpers.ts";

// Force `process.platform === "darwin"` for the duration of this file.
// `runSelfUpdate`'s platform guard rejects non-macOS hosts (§10.3), so
// every happy-path test here would fail on a Linux CI runner without
// this override. The dedicated "platform guard" test below still
// flips it back to "linux" for that one case.
const originalPlatform = process.platform;
beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
});
afterAll(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

afterEach(() => {
  resetReleaseFetcher();
  resetAssetDownloader();
  resetXattrClearer();
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
    setXattrClearer(() => {});

    const result = runSelfUpdate({ home, force: false, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(result.latestTag).toBe("v99.99.99");
    expect(readFileSync(dest, "utf8")).toBe("NEW");

    const record = readVersionCheck(home);
    expect(record?.latest_tag).toBe("v99.99.99");
    expect(existsSync(paths(home).versionCheckFile)).toBe(true);
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
    setXattrClearer(() => {});

    const result = runSelfUpdate({ home, force: true, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("FORCED");
  });

  test("self_update_unavailable when release has no matching asset", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({ tag: "v99.99.99", assets: {} }));

    expect(() => runSelfUpdate({ home, force: false, execPath: dest })).toThrow(
      /has no asset named/,
    );
  });

  test("self_update_unavailable when release has no checksum asset", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: { [currentAssetName()]: "https://example.com/asset" },
    }));

    expect(() => runSelfUpdate({ home, force: false, execPath: dest })).toThrow(/SHA256SUMS/);
  });

  test("checksum mismatch leaves the old binary in place", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({ tag: "v99.99.99", assets: releaseAssets() }));
    setAssetDownloader((url, destPath) => {
      const body = url.includes("SHA256SUMS") ? checksumTextFor("EXPECTED") : "TAMPERED";
      writeFileSync(destPath, body);
    });

    expect(() => runSelfUpdate({ home, force: false, execPath: dest })).toThrow(
      /checksum mismatch/,
    );
    expect(readFileSync(dest, "utf8")).toBe("OLD");
  });

  test("accepts an explicit tag", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    let requestedUrl = "";
    setReleaseFetcher((url) => {
      requestedUrl = url;
      return { tag: "v0.5.0", assets: releaseAssets() };
    });
    setAssetDownloader(downloaderForBinary("NEW"));
    setXattrClearer(() => {});

    runSelfUpdate({ home, force: false, execPath: dest, tag: "v0.5.0" });
    expect(requestedUrl).toContain("/releases/tags/v0.5.0");
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

describe("platform guard", () => {
  test("non-darwin raises self_update_unavailable before touching the network", () => {
    // Inside this file, `beforeAll` has stamped platform = "darwin".
    // Flip to linux for this test alone and restore to darwin after,
    // keeping the file-level invariant intact for any later tests.
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    let fetcherCalled = false;
    setReleaseFetcher(() => {
      fetcherCalled = true;
      return { tag: "v1", assets: {} };
    });
    try {
      expect(() => runSelfUpdateCheck(makeCrewHome())).toThrow(
        /Homecrew ships macOS binaries only/,
      );
      expect(fetcherCalled).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    }
  });
});
