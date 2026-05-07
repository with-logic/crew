/**
 * Release signature verification for self-update (§10.3).
 *
 * Future releases publish SHA256SUMS plus SHA256SUMS.sig. The signature
 * authenticates the checksum file with Homecrew's pinned public key.
 */

import { createVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { downloadAssetToTemp } from "./download.ts";
import { RELEASE_SIGNING_PUBLIC_KEY } from "./signing-key.ts";

export const CHECKSUMS_SIGNATURE_ASSET_NAME = "SHA256SUMS.sig";
export const FIRST_SIGNED_RELEASE = "v0.7.1";

export type ReleaseSignatureVerifier = (checksumsText: string, signature: Buffer) => boolean;

let releaseSignatureVerifier: ReleaseSignatureVerifier = defaultReleaseSignatureVerifier;

export function setReleaseSignatureVerifier(verifier: ReleaseSignatureVerifier): void {
  releaseSignatureVerifier = verifier;
}

export function resetReleaseSignatureVerifier(): void {
  releaseSignatureVerifier = defaultReleaseSignatureVerifier;
}

export function checksumSignatureAssetUrl(
  assets: Readonly<Record<string, string>>,
  tag: string,
): string | null {
  const url = assets[CHECKSUMS_SIGNATURE_ASSET_NAME];
  if (url) return url;
  if (!releaseRequiresSignature(tag)) return null;
  throw new CrewError(
    "self_update_unavailable",
    `release ${tag} has no asset named \`${CHECKSUMS_SIGNATURE_ASSET_NAME}\``,
    { tag, assetName: CHECKSUMS_SIGNATURE_ASSET_NAME },
  );
}

export function downloadChecksumSignature(url: string, timeoutSeconds: number): Buffer {
  return readFileSync(downloadAssetToTemp(url, timeoutSeconds));
}

export function verifyChecksumsSignature(checksumsText: string, signature: Buffer): void {
  if (releaseSignatureVerifier(checksumsText, signature)) return;
  throw new CrewError("self_update_unavailable", "checksum signature verification failed");
}

export function verifyChecksumsSignatureWithKey(
  checksumsText: string,
  signature: Buffer,
  publicKey: string,
): boolean {
  const verifier = createVerify("sha256");
  verifier.update(checksumsText);
  verifier.end();
  return verifier.verify(publicKey, signature);
}

export function releaseRequiresSignature(tag: string): boolean {
  const parsed = parseSemver(tag);
  if (!parsed) return true;
  const first = parseSemver(FIRST_SIGNED_RELEASE)!;
  for (let i = 0; i < parsed.length; i += 1) {
    if (parsed[i]! > first[i]!) return true;
    if (parsed[i]! < first[i]!) return false;
  }
  return true;
}

function parseSemver(tag: string): readonly [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function defaultReleaseSignatureVerifier(checksumsText: string, signature: Buffer): boolean {
  return verifyChecksumsSignatureWithKey(checksumsText, signature, RELEASE_SIGNING_PUBLIC_KEY);
}
