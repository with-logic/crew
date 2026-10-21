/** Non-fatal self-update cleanup diagnostics through human and JSON CLI output (§10.3). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import {
  resetAssetDownloader,
  resetXattrClearer,
  setXattrClearer,
} from "../../../src/self-update/download.ts";
import { resetReleaseFetcher } from "../../../src/self-update/github.ts";
import { resetReleaseSignatureVerifier } from "../../../src/self-update/signature.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { captureDownload, removeCapturedDownload, retainDownloadRoot } from "../upgrade/helpers.ts";

const savedTarget = process.env["CREW_SELF_UPDATE_TARGET"];

afterEach(() => {
  resetAssetDownloader();
  resetXattrClearer();
  resetReleaseFetcher();
  resetReleaseSignatureVerifier();
  if (savedTarget === undefined) delete process.env["CREW_SELF_UPDATE_TARGET"];
  else process.env["CREW_SELF_UPDATE_TARGET"] = savedTarget;
});

test.each(["human", "quiet", "json"])("cleanup warning preserves successful %s output", (mode) => {
  const home = makeCrewHome();
  const dest = join(home, "crew");
  writeFileSync(dest, "OLD");
  process.env["CREW_SELF_UPDATE_TARGET"] = dest;
  const captured = captureDownload();
  setXattrClearer(retainDownloadRoot);
  const cap = captureStreams();
  const flags = mode === "human" ? [] : [`--${mode}`];
  try {
    expect(runCli(["self-update", ...flags], { home, streams: cap.streams })).toBe(0);
    expect(readFileSync(dest, "utf8")).toBe("NEW");
    if (mode === "json") {
      const output = JSON.parse(cap.stdout());
      expect(output.replaced).toBe(true);
      expect(output.cleanup_warning).toContain(dirname(captured.assetPath));
      expect(output.cleanup_warning).toContain("EACCES");
      expect(cap.stderr()).toBe("");
    } else {
      expect(cap.stderr()).toContain(dirname(captured.assetPath));
      expect(cap.stderr()).toContain("EACCES");
      if (mode === "quiet") expect(cap.stdout()).toBe("");
      else expect(cap.stdout()).toContain("Upgraded Homecrew");
    }
  } finally {
    removeCapturedDownload(captured);
  }
});

test("successful cleanup omits the optional JSON warning", () => {
  const home = makeCrewHome();
  const dest = join(home, "crew");
  writeFileSync(dest, "OLD");
  process.env["CREW_SELF_UPDATE_TARGET"] = dest;
  captureDownload();
  const cap = captureStreams();
  expect(runCli(["self-update", "--json"], { home, streams: cap.streams })).toBe(0);
  expect(JSON.parse(cap.stdout())).not.toHaveProperty("cleanup_warning");
  expect(cap.stderr()).toBe("");
});

test.each([false, true])("failed cleanup preserves the primary CLI error (json=%s)", (json) => {
  const home = makeCrewHome();
  const dest = join(home, "crew");
  writeFileSync(dest, "OLD");
  process.env["CREW_SELF_UPDATE_TARGET"] = dest;
  const captured = captureDownload();
  setXattrClearer((tempPath) => {
    chmodSync(dirname(tempPath), 0o500);
    throw new Error("xattr fixture failure");
  });
  const cap = captureStreams();
  try {
    const flags = json ? ["--json"] : [];
    expect(runCli(["self-update", ...flags], { home, streams: cap.streams })).toBe(8);
    expect(readFileSync(dest, "utf8")).toBe("OLD");
    const output = json ? JSON.parse(cap.stdout()).error : null;
    const message = json ? output.message : cap.stderr();
    expect(message).toContain("xattr fixture failure");
    expect(message).toContain("cleanup warning:");
    expect(message).toContain(dirname(captured.assetPath));
    if (json) {
      expect(output.name).toBe("self_update_failed");
      expect(output.details).toEqual({ dest, cause: "xattr fixture failure" });
    }
  } finally {
    removeCapturedDownload(captured);
  }
});
