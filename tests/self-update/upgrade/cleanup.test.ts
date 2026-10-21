/** Release-download ownership after swap or version-record failures (§10.3). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { paths } from "../../../src/core/paths.ts";
import {
  resetAssetDownloader,
  resetXattrClearer,
  setXattrClearer,
} from "../../../src/self-update/download.ts";
import { resetReleaseFetcher } from "../../../src/self-update/github.ts";
import { resetReleaseSignatureVerifier } from "../../../src/self-update/signature.ts";
import { runSelfUpdate } from "../../../src/self-update/upgrade.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { captureDownload, removeCapturedDownload, retainDownloadRoot } from "./helpers.ts";

afterEach(() => {
  resetAssetDownloader();
  resetXattrClearer();
  resetReleaseFetcher();
  resetReleaseSignatureVerifier();
});

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
    expect((failure as Error).message).toContain("cleanup warning:");
    expect((failure as Error).message).toContain(dirname(captured.assetPath));
    expect((failure as Error).message).toContain("EACCES");
    expect((failure as CrewError).details).toEqual({ dest, cause: "xattr fixture failure" });
    expect(readFileSync(dest, "utf8")).toBe("OLD");
    // Real permissions prevent removal until the fixture restores ownership access.
    expect(existsSync(captured.assetPath)).toBe(true);
  } finally {
    removeCapturedDownload(captured);
  }
});

test("cleanup failure preserves success and reports a sanitized retained-root warning", () => {
  const home = makeCrewHome();
  const dest = join(home, "crew");
  writeFileSync(dest, "OLD");
  const captured = captureDownload();
  setXattrClearer(retainDownloadRoot);
  const savedTmp = process.env["TMPDIR"];
  const tempRoot = join(home, "tmp\ncontrol");
  mkdirSync(tempRoot);
  process.env["TMPDIR"] = tempRoot;
  try {
    const result = runSelfUpdate({ home, force: true, execPath: dest });
    expect(result.replaced).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("NEW");
    expect(result.cleanupWarning).toContain("tmp\\x0acontrol/crew-self-update-");
    expect(result.cleanupWarning).toContain("EACCES");
    expect(result.cleanupWarning).not.toContain("\n");
    expect(existsSync(dirname(captured.assetPath))).toBe(true);
  } finally {
    if (savedTmp === undefined) delete process.env["TMPDIR"];
    else process.env["TMPDIR"] = savedTmp;
    removeCapturedDownload(captured);
  }
});
