/**
 * The one-time move from the pre-0.11 per-tap-name clone layout to the
 * shared `repos/` layout (§6, C-TAP-29).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { legacyTapPath, paths } from "../../../src/core/paths.ts";
import { migrateTapClone } from "../../../src/sources/migrate-clones.ts";
import { withTapLocks } from "../../../src/sources/tap-lock.ts";
import { ensureDir } from "../../../src/util/fs.ts";
import { cloneDirForTap, cloneDirs, makeTempDir, tagRepo } from "../../helpers/fixtures.ts";
import { bareHome, run, twoSubpathRepo } from "./helpers.ts";

describe("migration from the per-tap-name clone layout", () => {
  test("C-TAP-29 an old-layout clone is moved on the next command and still works", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;

    // Put the home back into the pre-0.11 shape.
    const legacy = legacyTapPath("alpha-tap", home);
    ensureDir(paths(home).tapsDir);
    renameSync(shared, legacy);
    expect(existsSync(shared)).toBe(false);

    const search = run(home, ["search", "--json", "alpha"]);
    expect(search.code).toBe(0);
    const parsed = JSON.parse(search.stdout) as { hits: { name: string }[] };
    expect(parsed.hits.some((h) => h.name === "alpha")).toBe(true);
    // The clone moved rather than being re-cloned, and the old path is gone.
    expect(existsSync(shared)).toBe(true);
    expect(existsSync(legacy)).toBe(false);
  });

  test("C-TAP-29 a redundant old clone is dropped when the shared one already exists", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;

    // The old layout gave each tap its own copy of the same repository.
    // Recreate the second copy while the shared clone is already there.
    const legacy = legacyTapPath("beta-tap", home);
    ensureDir(join(legacy, ".git"));
    expect(existsSync(legacy)).toBe(true);

    expect(run(home, ["tap", "update"]).code).toBe(0);
    const search = run(home, ["search", "--json", "beta"]);
    expect(search.code).toBe(0);
    // The duplicate is discarded; the shared clone is untouched.
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(shared)).toBe(true);
    expect(cloneDirs(home)).toHaveLength(1);
  });
});

test("C-TAP-29 migration cannot relocate or delete an external directory", () => {
  const home = bareHome();
  const repo = twoSubpathRepo();
  expect(run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]).code).toBe(0);
  const tap = readConfig(home).taps[0]!;
  const outside = makeTempDir("crew-migration-outside-");
  writeFileSync(join(outside, "keep.txt"), "keep");
  const escaped = { ...tap, name: `../../${outside.split("/").pop()}` };
  expect(withTapLocks([escaped], home, () => migrateTapClone(escaped, home))).toBe(false);
  ensureDir(paths(home).tapsDir);
  symlinkSync(outside, legacyTapPath(tap.name, home));
  expect(() => withTapLocks([tap], home, () => migrateTapClone(tap, home))).toThrow("symlink");
  expect(run(home, ["tap", "update"]).code).toBe(1);
  expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("keep");
  expect(existsSync(cloneDirForTap("alpha-tap", home)!)).toBe(true);
});

test("C-TAP-29 a requested-ref preview migrates the shared clone before exporting", () => {
  const home = bareHome();
  const repo = twoSubpathRepo();
  tagRepo(repo, "v1");
  expect(run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]).code).toBe(0);
  const shared = cloneDirForTap("alpha-tap", home)!;
  const legacy = legacyTapPath("alpha-tap", home);
  ensureDir(paths(home).tapsDir);
  renameSync(shared, legacy);
  const result = run(home, ["info", "alpha-tap@v1", "--json"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("alpha");
  expect(existsSync(shared)).toBe(true);
  expect(existsSync(legacy)).toBe(false);
  expect(cloneDirs(home)).toHaveLength(1);
});

test("C-TAP-29 promoting an old auto tap migrates before forgetting its old name", () => {
  const home = bareHome();
  const repo = twoSubpathRepo();
  expect(run(home, ["install", `file://${repo}//alpha`]).code).toBe(0);
  const oldTap = readConfig(home).taps[0]!;
  const shared = cloneDirForTap(oldTap.name, home)!;
  const legacy = legacyTapPath(oldTap.name, home);
  ensureDir(paths(home).tapsDir);
  renameSync(shared, legacy);
  expect(run(home, ["tap", "add", `file://${repo}//alpha`, "promoted"]).code).toBe(0);
  expect(existsSync(shared)).toBe(true);
  expect(existsSync(legacy)).toBe(false);
});
