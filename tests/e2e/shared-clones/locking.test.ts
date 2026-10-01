/** Tap aliases acquire one physical clone lock across migration and reads (§6, §14). */

import { expect, test } from "bun:test";
import { existsSync, renameSync } from "node:fs";
import { readConfig } from "../../../src/config/load.ts";
import { legacyTapPath, paths } from "../../../src/core/paths.ts";
import { withDiscoveredTapLocks } from "../../../src/sources/discovered-tap-locks.ts";
import { tapLockTarget, withTapLocks } from "../../../src/sources/tap-lock.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { ensureDir } from "../../../src/util/fs.ts";
import { cloneDirForTap } from "../../helpers/fixtures.ts";
import { bareHome, run, twoSubpathRepo } from "./helpers.ts";

test("C-UPD-18d different tap names share a deduplicated physical clone lock", () => {
  const home = bareHome();
  const repo = twoSubpathRepo();
  expect(run(home, ["tap", "add", `file://${repo}//alpha`, "alpha"]).code).toBe(0);
  expect(run(home, ["tap", "add", `file://${repo}//beta`, "beta"]).code).toBe(0);
  const [alpha, beta] = readConfig(home).taps;
  expect(tapLockTarget(alpha!, home)).toBe(tapLockTarget(beta!, home));
  expect(withTapLocks([alpha!, beta!], home, () => "locked once")).toBe("locked once");
  let attempts = 0;
  withDiscoveredTapLocks([alpha!], home, (requireTap) => {
    attempts++;
    requireTap(beta!);
  });
  expect(attempts).toBe(1);
  const shared = cloneDirForTap("alpha", home)!;
  const legacy = legacyTapPath("beta", home);
  ensureDir(paths(home).tapsDir);
  renameSync(shared, legacy);
  const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
  const held = acquireLock(tapLockTarget(alpha!, home));
  try {
    for (const args of [
      ["search", "--tap", "beta"],
      ["install", "beta"],
      ["tap", "update", "beta"],
      ["tap", "remove", "beta"],
    ]) {
      expect(run(home, args).code).toBe(7);
    }
    expect(existsSync(legacy)).toBe(true);
    expect(existsSync(shared)).toBe(false);
  } finally {
    held.release();
    if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
    else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
  }
  expect(run(home, ["search", "--tap", "beta"]).code).toBe(0);
  expect(existsSync(shared)).toBe(true);
  expect(existsSync(legacy)).toBe(false);
  expect(run(home, ["tap", "remove", "beta"]).stdout).toContain("shared clone retained");
});
