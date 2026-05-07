/**
 * Tests for self-update SHA256SUMS parsing and verification (§10.3).
 */

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  checksumAssetUrl,
  expectedChecksum,
  verifyAssetChecksum,
} from "../../src/self-update/checksum.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { checksumTextFor, currentAssetName, releaseAssets, sha256Hex } from "./helpers.ts";

describe("checksumAssetUrl", () => {
  test("returns the release SHA256SUMS asset URL", () => {
    expect(checksumAssetUrl(releaseAssets(), "v1.2.3")).toContain("SHA256SUMS");
  });

  test("missing SHA256SUMS is self_update_unavailable", () => {
    expect(() => checksumAssetUrl({}, "v1.2.3")).toThrow(/SHA256SUMS/);
  });
});

describe("expectedChecksum", () => {
  test("finds the selected asset and normalizes uppercase hex", () => {
    const asset = currentAssetName();
    const hash = sha256Hex("binary").toUpperCase();
    const text = `\nnot-a-checksum\n${sha256Hex("other")}  other\n${hash} *${asset}\n`;
    expect(expectedChecksum(text, asset)).toBe(hash.toLowerCase());
  });

  test("invalid selected digest is self_update_unavailable", () => {
    expect(() => expectedChecksum(`nothex  ${currentAssetName()}\n`, currentAssetName())).toThrow(
      /not a valid SHA-256/,
    );
  });

  test("missing selected asset is self_update_unavailable", () => {
    expect(() => expectedChecksum(checksumTextFor("binary", "other"), currentAssetName())).toThrow(
      /no entry/,
    );
  });
});

describe("verifyAssetChecksum", () => {
  test("accepts a matching downloaded binary", () => {
    const home = makeCrewHome();
    const path = join(home, "crew");
    writeFileSync(path, "binary");
    expect(() =>
      verifyAssetChecksum(path, currentAssetName(), checksumTextFor("binary")),
    ).not.toThrow();
  });

  test("checksum mismatch is self_update_unavailable", () => {
    const home = makeCrewHome();
    const path = join(home, "crew");
    writeFileSync(path, "tampered");
    expect(() => verifyAssetChecksum(path, currentAssetName(), checksumTextFor("binary"))).toThrow(
      /checksum mismatch/,
    );
  });
});
