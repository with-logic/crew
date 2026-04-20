/**
 * Tests for the asset-download + binary-swap layer.
 *
 * Both the network fetch (`setAssetDownloader`) and the xattr shell
 * call (`setXattrClearer`) are behind seams, so these tests never
 * touch the network or invoke `xattr(1)`. The binary swap itself
 * writes to real tmp files — that's the whole point of atomicity we
 * want to verify.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assetNameForArch,
  downloadAssetToTemp,
  installBinary,
  resetAssetDownloader,
  resetXattrClearer,
  setAssetDownloader,
  setXattrClearer,
} from "../../src/self-update/download.ts";
import { makeCrewHome } from "../helpers/env.ts";

afterEach(() => {
  resetAssetDownloader();
  resetXattrClearer();
});

describe("assetNameForArch", () => {
  test("arm64 → crew-macos-arm64", () => {
    expect(assetNameForArch("arm64")).toBe("crew-macos-arm64");
  });

  test("x64 → crew-macos-x64", () => {
    expect(assetNameForArch("x64")).toBe("crew-macos-x64");
  });

  test("throws self_update_unavailable for unknown arches", () => {
    expect(() => assetNameForArch("riscv64")).toThrow(/no release asset for this CPU \(riscv64\)/);
  });
});

describe("downloadAssetToTemp", () => {
  test("writes downloaded bytes to a fresh temp path and returns it", () => {
    setAssetDownloader((_url, destPath) => {
      writeFileSync(destPath, "fake-binary-bytes");
    });
    const path = downloadAssetToTemp("https://example.com/crew", 5);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("fake-binary-bytes");
  });

  test("wraps downloader failures as self_update_unavailable", () => {
    setAssetDownloader(() => {
      throw new Error("network down");
    });
    expect(() => downloadAssetToTemp("https://example.com/crew", 5)).toThrow(/network down/);
  });
});

describe("installBinary", () => {
  test("chmod +x, clears quarantine xattr, atomically replaces dest", () => {
    const home = makeCrewHome();
    const src = join(home, "fresh");
    const dest = join(home, "crew");
    writeFileSync(src, "new-binary");
    writeFileSync(dest, "old-binary");

    const xattrCalls: string[] = [];
    setXattrClearer((p) => xattrCalls.push(p));

    installBinary(src, dest);

    expect(readFileSync(dest, "utf8")).toBe("new-binary");
    expect(existsSync(src)).toBe(false);
    // chmod observable on macOS/Linux: executable bits set.
    const mode = statSync(dest).mode;
    expect(mode & 0o111).not.toBe(0);
    expect(xattrCalls).toEqual([src]);
  });

  test("wraps filesystem failures as self_update_failed", () => {
    const home = makeCrewHome();
    const src = join(home, "does-not-exist");
    const dest = join(home, "crew");
    expect(() => installBinary(src, dest)).toThrow(/couldn't replace/);
  });
});
