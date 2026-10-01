/** Tap collection updates and refresh failures (PRD §10.1, C-UPD-26/29/35). */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runGit } from "../../../src/git/exec.ts";
import {
  cloneDirForTap,
  commitAll,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { addBrokenTap, buildFlatTap, bump, freshHome, installedBody, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let ccRoot = "";
beforeEach(() => {
  ccRoot = makeTempDir("upd-coll-taps-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});
const body = (name: string) => installedBody(ccRoot, name);

describe("crew update <tap>", () => {
  test("C-UPD-26 a tap name updates every entry from it and picks up new siblings", () => {
    const home = freshHome();
    const repo = buildFlatTap("upd-coll-tap-", ["alpha", "beta"]);
    expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    // Both existing members move, so the test proves the whole tap is
    // updated rather than just the first member.
    bump(repo, "", "alpha", "alpha-v2");
    bump(repo, "", "beta", "beta-v2");
    makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(repo, "add gamma");

    const r = run(home, ["update", "acme"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Updating tap acme (2 skills)");
    expect(body("alpha")).toContain("alpha-v2");
    expect(body("beta")).toContain("beta-v2");
    expect(body("gamma")).toContain("name: gamma");

    const j = run(home, ["update", "acme", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "acme", kind: "tap", name: "acme" }]);
    // Every member appears in the rows, not just the one that changed.
    expect(j.rows.map((row: { name: string }) => row.name).sort()).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  test("C-UPD-35 an unreachable tap named as a selector is a hard failure", () => {
    const home = freshHome();
    addBrokenTap(home, "broken");

    // The user asked for this tap by name and it could not be
    // refreshed, so the run did not do what was asked: exit 1, not a
    // warning that scrolls past.
    const r = run(home, ["update", "broken"]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/couldn't refresh tap.*broken/);
    expect(r.out).not.toContain("refreshed it anyway");
  });

  test("C-UPD-35 an unreachable tap nobody named stays a warning", () => {
    const home = freshHome();
    const repo = buildFlatTap("upd-coll-warn-", ["alpha"]);
    expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
    expect(run(home, ["install", "acme"]).code).toBe(0);
    addBrokenTap(home, "broken");

    // Selecting `acme` does not name `broken`, so its failure falls
    // under per-tap isolation (§10.1) and the run still exits 0.
    const r = run(home, ["update", "acme"]);
    expect(r.code).toBe(0);
  });

  test("C-UPD-29 a tap with nothing installed is fetched and reported, exit 0", () => {
    const home = freshHome();
    const repo = buildFlatTap("upd-coll-empty-", ["alpha"]);
    expect(run(home, ["tap", "add", `file://${repo}`, "quiet"]).code).toBe(0);
    const before = runGit(["rev-parse", "HEAD"], {
      cwd: cloneDirForTap("quiet", home)!,
    }).stdout.trim();
    bump(repo, "", "alpha", "v2");

    const r = run(home, ["update", "quiet"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("No skills installed from tap quiet — refreshed it anyway.");
    const after = runGit(["rev-parse", "HEAD"], {
      cwd: cloneDirForTap("quiet", home)!,
    }).stdout.trim();
    expect(after).not.toBe(before);
  });
});
