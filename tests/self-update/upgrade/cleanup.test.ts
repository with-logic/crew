/** Release-download ownership after swap or version-record failures (§10.3). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { paths } from "../../../src/core/paths.ts";
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
import { runSelfUpdate } from "../../../src/self-update/upgrade.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { downloaderForBinary, releaseAssets } from "../helpers.ts";

afterEach(() => {
  resetAssetDownloader();
  resetXattrClearer();
  resetReleaseFetcher();
  resetReleaseSignatureVerifier();
});

function captureDownload(): { assetPath: string } {
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

test("failed replacement releases downloaded bytes and preserves self_update_failed", () => {
  const home = makeCrewHome();
  const parent = join(home, "not-a-directory");
  writeFileSync(parent, "OLD");
  const captured = captureDownload();
  let failure: unknown;
  try {
    runSelfUpdate({ home, force: true, execPath: join(parent, "crew") });
  } catch (err) {
    failure = err;
  }
  expect(failure).toBeInstanceOf(CrewError);
  expect((failure as CrewError).code).toBe("self_update_failed");
  expect((failure as Error).message).toContain("couldn't replace");
  expect(readFileSync(parent, "utf8")).toBe("OLD");
  expect(existsSync(paths(home).versionCheckFile)).toBe(false);
  expect(existsSync(dirname(captured.assetPath))).toBe(false);
});

test("failed version-record write releases the empty download root after replacement", () => {
  const home = makeCrewHome();
  const dest = join(home, "crew");
  writeFileSync(dest, "OLD");
  mkdirSync(paths(home).versionCheckFile);
  const captured = captureDownload();
  expect(() => runSelfUpdate({ home, force: true, execPath: dest })).toThrow();
  expect(readFileSync(dest, "utf8")).toBe("NEW");
  expect(existsSync(dirname(captured.assetPath))).toBe(false);
});

test("cleanup failure preserves the original replacement error and diagnostics", () => {
  const home = makeCrewHome();
  const dest = join(home, "crew");
  writeFileSync(dest, "OLD");
  const captured = captureDownload();
  setXattrClearer((tempPath) => {
    chmodSync(dirname(tempPath), 0o500);
    throw new Error("xattr fixture failure");
  });
  try {
    let failure: unknown;
    try {
      runSelfUpdate({ home, force: true, execPath: dest });
    } catch (err) {
      failure = err;
    }
    expect(failure).toBeInstanceOf(CrewError);
    expect((failure as CrewError).code).toBe("self_update_failed");
    expect((failure as Error).message).toContain("xattr fixture failure");
    expect((failure as CrewError).details).toEqual({ dest, cause: "xattr fixture failure" });
    expect(readFileSync(dest, "utf8")).toBe("OLD");
    // Real permissions prevent removal until the fixture restores ownership access.
    expect(existsSync(captured.assetPath)).toBe(true);
  } finally {
    chmodSync(dirname(captured.assetPath), 0o700);
    rmSync(dirname(captured.assetPath), { recursive: true, force: true });
  }
});
