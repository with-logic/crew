/**
 * Shared fixtures for self-update checksum tests.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { type AssetDownloader, assetNameForArch } from "../../src/self-update/download.ts";

export const ASSET_URL = "https://example.com/asset";
export const CHECKSUMS_URL = "https://example.com/SHA256SUMS";

export function currentAssetName(): string {
  return assetNameForArch();
}

export function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function releaseAssets(bytesUrl: string = ASSET_URL): Record<string, string> {
  return { [currentAssetName()]: bytesUrl, SHA256SUMS: CHECKSUMS_URL };
}

export function checksumTextFor(bytes: string, assetName: string = currentAssetName()): string {
  return `${sha256Hex(bytes)}  ${assetName}\n`;
}

export function downloaderForBinary(bytes: string): AssetDownloader {
  return (url, destPath) => {
    const body = url === CHECKSUMS_URL ? checksumTextFor(bytes) : bytes;
    writeFileSync(destPath, body);
  };
}
