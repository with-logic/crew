/** Shared successful-release setup and binary-download capture (§10.3). */

import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setAssetDownloader, setXattrClearer } from "../../../src/self-update/download.ts";
import { setReleaseFetcher } from "../../../src/self-update/github.ts";
import { setReleaseSignatureVerifier } from "../../../src/self-update/signature.ts";
import { downloaderForBinary, releaseAssets } from "../helpers.ts";

export function captureDownload(): { assetPath: string } {
  const captured = { assetPath: "" };
  const download = downloaderForBinary("NEW");
  setReleaseFetcher(() => ({ tag: "v99.99.99", assets: releaseAssets() }));
  setReleaseSignatureVerifier(() => true);
  setXattrClearer(() => {});
  setAssetDownloader((url, destPath, timeout, maxBytes) => {
    if (url.endsWith("/asset")) captured.assetPath = destPath;
    download(url, destPath, timeout, maxBytes);
  });
  return captured;
}

const RETAINED_DIRECTORY = "retained\nfixture";

/** Deny recursive cleanup while leaving the binary's parent writable for rename. */
export function retainDownloadRoot(tempPath: string): void {
  const retained = join(dirname(tempPath), RETAINED_DIRECTORY);
  mkdirSync(retained);
  writeFileSync(join(retained, "payload"), "retained bytes");
  chmodSync(retained, 0o500);
}

/** Restore fixture permissions, removing only a captured download root. */
export function removeCapturedDownload(captured: { readonly assetPath: string }): void {
  if (captured.assetPath) {
    const root = dirname(captured.assetPath);
    const retained = join(root, RETAINED_DIRECTORY);
    if (existsSync(retained)) chmodSync(retained, 0o700);
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
}
