/**
 * runSelfUpdate failure paths (§17.2): releases missing assets or signatures,
 * checksum mismatch, explicit tags, and the platform guard.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
import {
  CHECKSUMS_SIGNATURE_URL,
  CHECKSUMS_URL,
  checksumTextFor,
  currentAssetName,
  downloaderForBinary,
  releaseAssets,
} from "../helpers.ts";

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

  test("self_update_unavailable when future release has no checksum signature asset", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({
      tag: "v99.99.99",
      assets: {
        [currentAssetName()]: "https://example.com/asset",
        SHA256SUMS: "https://example.com/SHA256SUMS",
      },
    }));
    setAssetDownloader((_, destPath) => writeFileSync(destPath, checksumTextFor("NEW")));

    expect(() => runSelfUpdate({ home, force: false, execPath: dest })).toThrow(/SHA256SUMS\.sig/);
  });

  test("legacy v0.7.0 release can update without a checksum signature asset", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({
      tag: "v0.7.0",
      assets: {
        [currentAssetName()]: "https://example.com/asset",
        SHA256SUMS: CHECKSUMS_URL,
      },
    }));
    setAssetDownloader(downloaderForBinary("NEW"));
    setXattrClearer(() => {});

    const result = runSelfUpdate({ home, force: true, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("NEW");
  });

  test("checksum mismatch leaves the old binary in place", () => {
    const home = makeCrewHome();
    const dest = join(home, "crew-bin");
    writeFileSync(dest, "OLD");

    setReleaseFetcher(() => ({ tag: "v99.99.99", assets: releaseAssets() }));
    let assetPath = "";
    setAssetDownloader((url, destPath) => {
      if (url.endsWith("/asset")) assetPath = destPath;
      const body =
        url === CHECKSUMS_URL || url === CHECKSUMS_SIGNATURE_URL
          ? checksumTextFor("EXPECTED")
          : "TAMPERED";
      writeFileSync(destPath, body);
    });
    setReleaseSignatureVerifier(() => true);

    expect(() => runSelfUpdate({ home, force: false, execPath: dest })).toThrow(
      /checksum mismatch/,
    );
    expect(readFileSync(dest, "utf8")).toBe("OLD");
    expect(existsSync(dirname(assetPath))).toBe(false);
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
    setReleaseSignatureVerifier(() => true);
    setXattrClearer(() => {});

    runSelfUpdate({ home, force: false, execPath: dest, tag: "v0.5.0" });
    expect(requestedUrl).toContain("/releases/tags/v0.5.0");
  });
});
describe("platform guard", () => {
  test("unsupported platforms raise self_update_unavailable before touching the network", () => {
    // Inside this file, `beforeAll` has stamped platform = "darwin".
    // Flip to freebsd for this test alone and restore to darwin after,
    // keeping the file-level invariant intact for any later tests.
    Object.defineProperty(process, "platform", { value: "freebsd", configurable: true });
    let fetcherCalled = false;
    setReleaseFetcher(() => {
      fetcherCalled = true;
      return { tag: "v1", assets: {} };
    });
    try {
      expect(() => runSelfUpdateCheck(makeCrewHome())).toThrow(
        /Homecrew ships binaries for macOS and Linux only/,
      );
      expect(fetcherCalled).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    }
  });
});
