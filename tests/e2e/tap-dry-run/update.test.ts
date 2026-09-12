/**
 * `crew tap update --dry-run` (§16.3, C-TAP-16b). The preview lists the
 * taps it would fetch without contacting any upstream.
 *
 * Asserting only that checkout `HEAD` is unchanged is not enough: a bare
 * `git fetch` moves the remote-tracking ref and leaves `HEAD` alone, so
 * these cases snapshot `refs/remotes/origin/*` as well.
 */

import { describe, expect, test } from "bun:test";
import { tapPath } from "../../../src/core/paths.ts";
import { runGit } from "../../../src/git/exec.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildTapRepo, run } from "./helpers.ts";

/** Every ref in the clone, so a fetch that moves only remote refs is caught. */
function refSnapshot(clone: string): string {
  return runGit(["show-ref"], { cwd: clone, throwOnError: false }).stdout.trim();
}

describe("C-TAP-16b tap update --dry-run", () => {
  test("lists pending git taps and skipped path taps without fetching", () => {
    const home = makeCrewHome();
    run(home, ["tap", "remove", "core", "--force"]);
    const repo = buildTapRepo("crew-dry-update-");
    run(home, ["tap", "add", `file://${repo}`, "remote"]);
    const dir = makeTempDir("crew-dry-update-path-");
    run(home, ["tap", "add", dir, "local"]);
    const clone = tapPath("remote", home);
    const headBefore = runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim();
    const refsBefore = refSnapshot(clone);
    // New upstream commit the preview must not pull down.
    makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(repo, "add gamma");

    const r = run(home, ["tap", "update", "--dry-run"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would refresh 2 taps");
    expect(r.stdout).toContain("would fetch");
    expect(r.stdout).toContain("skipped");
    expect(r.stdout).toContain("1 would be fetched");
    expect(runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim()).toBe(headBefore);
    // A bare fetch would leave HEAD alone but move origin/*.
    expect(refSnapshot(clone)).toBe(refsBefore);
  });

  test("named tap preview: JSON rows, no fetch", () => {
    const home = makeCrewHome();
    run(home, ["tap", "remove", "core", "--force"]);
    const repo = buildTapRepo("crew-dry-update-named-");
    run(home, ["tap", "add", `file://${repo}`, "remote"]);
    const clone = tapPath("remote", home);
    const refsBefore = refSnapshot(clone);
    makeSkill(repo, "delta", skillFrontmatter({ name: "delta" }));
    commitAll(repo, "add delta");

    const j = run(home, ["tap", "update", "--dry-run", "--json", "remote"]);

    const json = JSON.parse(j.stdout);
    expect(json.dry_run).toBe(true);
    expect(json.rows).toEqual([{ name: "remote", url: `file://${repo}`, kind: "pending" }]);
    expect(refSnapshot(clone)).toBe(refsBefore);
  });
});
