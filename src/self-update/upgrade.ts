/**
 * End-to-end self-update flow (§10.3).
 *
 * Stitches together the release-feed query, asset download, binary
 * swap, and version-check file refresh. Returns a small result object
 * so the command handler can render the right human output.
 */

import { dirname } from "node:path";
import { CrewError } from "../core/errors.ts";
import { CREW_VERSION } from "../core/version.ts";
import { rmrf } from "../util/fs.ts";
import { writeVersionCheck } from "./check.ts";
import { checksumAssetUrl, downloadChecksums, verifyAssetChecksum } from "./checksum.ts";
import { downloadAssetToTemp, installBinary, releaseAssetName } from "./download.ts";
import { fetchRelease, releasesByTagUrl, releasesLatestUrl } from "./github.ts";
import {
  checksumSignatureAssetUrl,
  downloadChecksumSignature,
  verifyChecksumsSignature,
} from "./signature.ts";

/** Timeout for the release-feed query. Short because we're on the foreground. */
const RELEASE_FETCH_TIMEOUT_SECONDS = 10;
/** Timeout for the binary download. Longer because it's bigger. */
const DOWNLOAD_TIMEOUT_SECONDS = 60;

/** Summary of what `runSelfUpdate` did, for the command layer to render. */
export interface SelfUpdateResult {
  readonly currentVersion: string;
  readonly latestTag: string;
  /** True if a replacement actually happened; false when already up-to-date. */
  readonly replaced: boolean;
}

export interface SelfUpdateOptions {
  readonly home: string;
  /** Explicit tag to install; if undefined, pick the latest. */
  readonly tag?: string;
  /** Reinstall even when the resolved tag equals the running version. */
  readonly force: boolean;
  /** Target binary path; defaults to `process.execPath`. */
  readonly execPath?: string;
}

export function runSelfUpdate(options: SelfUpdateOptions): SelfUpdateResult {
  assertSupportedPlatform();
  const url = options.tag ? releasesByTagUrl(options.tag) : releasesLatestUrl();
  const release = fetchRelease(url, RELEASE_FETCH_TIMEOUT_SECONDS);

  const currentVersion = `v${CREW_VERSION}`;
  if (sameTag(release.tag, currentVersion) && !options.force) {
    // Still refresh the version-check record so the nag won't fire
    // until another 24h have elapsed.
    writeVersionCheck(release.tag, options.home);
    return { currentVersion, latestTag: release.tag, replaced: false };
  }

  const assetName = releaseAssetName();
  const downloadUrl = release.assets[assetName];
  if (!downloadUrl) {
    throw new CrewError(
      "self_update_unavailable",
      `release ${release.tag} has no asset named \`${assetName}\``,
      { tag: release.tag, assetName },
    );
  }

  const checksumUrl = checksumAssetUrl(release.assets, release.tag);
  const checksumsText = downloadChecksums(checksumUrl, DOWNLOAD_TIMEOUT_SECONDS);
  const signatureUrl = checksumSignatureAssetUrl(release.assets, release.tag);
  if (signatureUrl) {
    const signature = downloadChecksumSignature(signatureUrl, DOWNLOAD_TIMEOUT_SECONDS);
    verifyChecksumsSignature(checksumsText, signature);
  }
  const tempPath = downloadAssetToTemp(downloadUrl, DOWNLOAD_TIMEOUT_SECONDS);
  try {
    verifyAssetChecksum(tempPath, assetName, checksumsText);
  } catch (err) {
    rmrf(dirname(tempPath));
    throw err;
  }
  installBinary(tempPath, resolveDest(options.execPath));
  writeVersionCheck(release.tag, options.home);
  return { currentVersion, latestTag: release.tag, replaced: true };
}

/**
 * The path we'll overwrite with the new binary. Takes an explicit
 * caller override first; otherwise honors `CREW_SELF_UPDATE_TARGET`
 * (test-only, never set in production); otherwise `process.execPath`.
 *
 * The env var exists because overwriting `process.execPath` during a
 * test run is a foot-cannon: on a dev box, `execPath` is `/opt/.../bun`
 * and a stray test would replace the user's Bun. In production,
 * `execPath` IS the `crew` binary and is exactly what we want to swap.
 */
function resolveDest(override: string | undefined): string {
  if (override) return override;
  const envOverride = process.env["CREW_SELF_UPDATE_TARGET"];
  if (envOverride) return envOverride;
  return process.execPath;
}

/** Just-check mode used by both `--check` and the background subprocess. */
export function runSelfUpdateCheck(
  home: string,
  tag?: string,
): { readonly currentVersion: string; readonly latestTag: string } {
  assertSupportedPlatform();
  const url = tag ? releasesByTagUrl(tag) : releasesLatestUrl();
  const release = fetchRelease(url, RELEASE_FETCH_TIMEOUT_SECONDS);
  writeVersionCheck(release.tag, home);
  return { currentVersion: `v${CREW_VERSION}`, latestTag: release.tag };
}

function sameTag(a: string, b: string): boolean {
  const norm = (t: string) => (t.startsWith("v") ? t.slice(1) : t);
  return norm(a) === norm(b);
}

function assertSupportedPlatform(): void {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new CrewError(
      "self_update_unavailable",
      "Homecrew ships binaries for macOS and Linux only. use your package manager or build from source on other platforms.",
      { platform: process.platform },
    );
  }
}
