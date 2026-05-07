/**
 * Release checksum verification for binary self-update (§10.3).
 *
 * `crew self-update` verifies the downloaded macOS binary against the
 * release's SHA256SUMS asset before making it executable or replacing
 * the running binary.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { downloadAssetToTemp } from "./download.ts";

export const CHECKSUMS_ASSET_NAME = "SHA256SUMS";

const SHA256_HEX = /^[a-fA-F0-9]{64}$/;

export function checksumAssetUrl(assets: Readonly<Record<string, string>>, tag: string): string {
  const url = assets[CHECKSUMS_ASSET_NAME];
  if (url) return url;
  throw new CrewError(
    "self_update_unavailable",
    `release ${tag} has no asset named \`${CHECKSUMS_ASSET_NAME}\``,
    { tag, assetName: CHECKSUMS_ASSET_NAME },
  );
}

export function downloadChecksums(url: string, timeoutSeconds: number): string {
  return readFileSync(downloadAssetToTemp(url, timeoutSeconds), "utf8");
}

export function verifyAssetChecksum(path: string, assetName: string, checksumsText: string): void {
  const expected = expectedChecksum(checksumsText, assetName);
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual === expected) return;
  throw new CrewError("self_update_unavailable", `checksum mismatch for ${assetName}`, {
    assetName,
    expected,
    actual,
  });
}

export function expectedChecksum(checksumsText: string, assetName: string): string {
  for (const line of checksumsText.split(/\r?\n/)) {
    const parsed = parseChecksumLine(line);
    if (!parsed) continue;
    const [hash, name] = parsed;
    if (name !== assetName) continue;
    if (SHA256_HEX.test(hash)) return hash.toLowerCase();
    throw new CrewError(
      "self_update_unavailable",
      `checksum entry for ${assetName} is not a valid SHA-256 digest`,
      { assetName, checksum: hash },
    );
  }
  throw new CrewError("self_update_unavailable", `checksum file has no entry for ${assetName}`, {
    assetName,
  });
}

function parseChecksumLine(line: string): readonly [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace < 0) return null;
  const hash = trimmed.slice(0, firstSpace);
  const name = trimmed.slice(firstSpace).trim().replace(/^\*/, "");
  return [hash, name];
}
