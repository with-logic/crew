/**
 * Release-asset download + binary swap (§10.3 steps 3–5).
 *
 * Downloads the right asset for the current platform and CPU architecture to a
 * temp file, marks it executable, clears the macOS quarantine xattr,
 * and atomically renames it over `process.execPath`. The running
 * process keeps executing on the old inode; the new binary takes
 * effect on the next invocation.
 *
 * Shells out to `curl` (the installer script already requires it) so
 * the command path can stay synchronous.
 */

import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { atomicReplace } from "../util/fs.ts";

export const RELEASE_ASSET_MAX_BYTES = 128 * 1024 * 1024;
export const CHECKSUMS_MAX_BYTES = 1024 * 1024;
export const CHECKSUM_SIGNATURE_MAX_BYTES = 64 * 1024;

/** Asset name for the current platform + CPU arch, or throws if unsupported. */
export function releaseAssetName(
  arch: NodeJS.Architecture = process.arch,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "darwin" && arch === "arm64") return "crew-macos-arm64";
  if (platform === "darwin" && arch === "x64") return "crew-macos-x64";
  if (platform === "linux" && arch === "arm64") return "crew-linux-arm64";
  if (platform === "linux" && arch === "x64") return "crew-linux-x64";
  throw new CrewError(
    "self_update_unavailable",
    `no release asset for this platform (${platform}/${arch}). Homecrew ships macOS and Linux arm64 and x64 builds.`,
    { arch, platform },
  );
}

/** Network seam: save bytes from a URL into `destPath`. */
export type AssetDownloader = (
  url: string,
  destPath: string,
  timeoutSeconds: number,
  maxBytes: number,
) => void;

let downloader: AssetDownloader = defaultDownloader;

export function setAssetDownloader(next: AssetDownloader): AssetDownloader {
  const prev = downloader;
  downloader = next;
  return prev;
}

export function resetAssetDownloader(): void {
  downloader = defaultDownloader;
}

/** xattr seam: clear the macOS quarantine flag. Tests no-op this. */
export type XattrClearer = (path: string) => void;

let xattrClearer: XattrClearer = defaultXattrClearer;

export function setXattrClearer(next: XattrClearer): XattrClearer {
  const prev = xattrClearer;
  xattrClearer = next;
  return prev;
}

export function resetXattrClearer(): void {
  xattrClearer = defaultXattrClearer;
}

/**
 * Download the bytes at `url` into a new temp file and return its path.
 * Raises `self_update_unavailable` on any network failure.
 */
export function downloadAssetToTemp(
  url: string,
  timeoutSeconds: number,
  maxBytes: number = RELEASE_ASSET_MAX_BYTES,
): string {
  const dir = mkdtempSync(join(tmpdir(), "crew-self-update-"));
  const path = join(dir, "crew");
  try {
    downloader(url, path, timeoutSeconds, maxBytes);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new CrewError(
      "self_update_unavailable",
      `couldn't download release asset from ${url}: ${(err as Error).message}`,
      { url, cause: (err as Error).message },
    );
  }
  const size = statSync(path).size;
  if (size > maxBytes) {
    rmSync(dir, { recursive: true, force: true });
    throw new CrewError(
      "self_update_unavailable",
      `downloaded file from ${url} exceeded the ${maxBytes} byte limit`,
      { url, size, maxBytes },
    );
  }
  return path;
}

/**
 * Mark `path` executable, clear the quarantine xattr (macOS), and
 * atomically rename it over `dest`. Raises `self_update_failed` on
 * any filesystem failure; the running binary at `dest` is left in
 * place in that case.
 */
export function installBinary(tempPath: string, dest: string): void {
  try {
    chmodSync(tempPath, 0o755);
    xattrClearer(tempPath);
    atomicReplace(tempPath, dest);
  } catch (err) {
    throw new CrewError(
      "self_update_failed",
      `couldn't replace ${dest}: ${(err as Error).message}`,
      { dest, cause: (err as Error).message },
    );
  }
}

function defaultDownloader(
  url: string,
  destPath: string,
  timeoutSeconds: number,
  maxBytes: number,
): void {
  const proc = Bun.spawnSync({
    cmd: [
      "curl",
      "-fsSL",
      "--max-time",
      String(timeoutSeconds),
      "--max-filesize",
      String(maxBytes),
      "-H",
      "User-Agent: crew-self-update",
      "-o",
      destPath,
      url,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });
  if ((proc.exitCode ?? -1) !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(stderr || `curl exited with ${proc.exitCode}`);
  }
}

function defaultXattrClearer(path: string): void {
  // `xattr -dr com.apple.quarantine <file>` is a no-op when the attr
  // isn't set. If `xattr` isn't on PATH (non-macOS CI runners), we
  // swallow and move on — the attr is macOS-specific.
  try {
    Bun.spawnSync({
      cmd: ["xattr", "-dr", "com.apple.quarantine", path],
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    // ignore — nothing to clear on non-macOS
  }
}
