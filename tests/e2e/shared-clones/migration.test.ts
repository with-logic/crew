/**
 * The one-time move from the pre-0.11 per-tap-name clone layout to the
 * shared `repos/` layout (§6, C-TAP-18).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { legacyTapPath, paths } from "../../../src/core/paths.ts";
import { ensureDir } from "../../../src/util/fs.ts";
import { cloneDirForTap, cloneDirs } from "../../helpers/fixtures.ts";
import { bareHome, run, twoSubpathRepo } from "./helpers.ts";

describe("migration from the per-tap-name clone layout", () => {
  test("C-TAP-18 an old-layout clone is moved on the next command and still works", () => {
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

  test("C-TAP-18 a redundant old clone is dropped when the shared one already exists", () => {
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

    const search = run(home, ["search", "--json", "beta"]);
    expect(search.code).toBe(0);
    // The duplicate is discarded; the shared clone is untouched.
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(shared)).toBe(true);
    expect(cloneDirs(home)).toHaveLength(1);
  });
});
