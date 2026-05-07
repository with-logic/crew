/**
 * Tests for release checksum signature verification (§10.3).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import { CrewError } from "../../src/core/errors.ts";
import {
  checksumSignatureAssetUrl,
  releaseRequiresSignature,
  resetReleaseSignatureVerifier,
  setReleaseSignatureVerifier,
  verifyChecksumsSignature,
  verifyChecksumsSignatureWithKey,
} from "../../src/self-update/signature.ts";
import { checksumTextFor, releaseAssets } from "./helpers.ts";

afterEach(() => resetReleaseSignatureVerifier());

describe("checksumSignatureAssetUrl", () => {
  test("returns the release SHA256SUMS.sig asset URL", () => {
    expect(checksumSignatureAssetUrl(releaseAssets(), "v1.2.3")).toContain("SHA256SUMS.sig");
  });

  test("future releases require a signature asset", () => {
    expect(() => checksumSignatureAssetUrl({}, "v0.7.1")).toThrow(/SHA256SUMS\.sig/);
  });

  test("legacy releases can fall back to checksum-only verification", () => {
    expect(checksumSignatureAssetUrl({}, "v0.7.0")).toBeNull();
  });
});

describe("releaseRequiresSignature", () => {
  test("requires signatures starting at v0.7.1", () => {
    expect(releaseRequiresSignature("v0.7.0")).toBe(false);
    expect(releaseRequiresSignature("v0.7.1")).toBe(true);
    expect(releaseRequiresSignature("v0.8.0")).toBe(true);
  });

  test("unknown version shapes require signatures", () => {
    expect(releaseRequiresSignature("latest")).toBe(true);
  });
});

describe("verifyChecksumsSignature", () => {
  test("accepts a valid RSA/SHA-256 signature", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const checksums = checksumTextFor("binary");
    const signer = createSign("sha256");
    signer.update(checksums);
    signer.end();
    const signature = signer.sign(privateKey);
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyChecksumsSignatureWithKey(checksums, signature, publicPem)).toBe(true);
  });

  test("throws self_update_unavailable when verification fails", () => {
    expect(() => verifyChecksumsSignature("checksums", Buffer.from("bad"))).toThrow(CrewError);
  });

  test("test seam can override signature verification", () => {
    setReleaseSignatureVerifier(() => true);
    expect(() => verifyChecksumsSignature("checksums", Buffer.from("bad"))).not.toThrow();
  });
});
