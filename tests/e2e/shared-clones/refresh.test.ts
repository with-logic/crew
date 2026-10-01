/** A legacy alias migration failure does not poison its repository refresh (§6, §16.4). */

import { expect, test } from "bun:test";
import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { legacyTapPath, paths } from "../../../src/core/paths.ts";
import { ensureDir } from "../../../src/util/fs.ts";
import { cloneDirForTap, commitAll, makeTempDir } from "../../helpers/fixtures.ts";
import { headSha } from "../tap-update/helpers.ts";
import { bareHome, run, twoSubpathRepo } from "./helpers.ts";

test("C-TAP-28c a failed legacy migration cannot prevent a healthy alias refreshing", () => {
  const home = bareHome();
  const repo = twoSubpathRepo();
  expect(run(home, ["tap", "add", `file://${repo}//alpha`, "broken"]).code).toBe(0);
  expect(run(home, ["tap", "add", `file://${repo}//beta`, "healthy"]).code).toBe(0);
  const clone = cloneDirForTap("healthy", home)!;
  const before = headSha(clone);
  const outside = makeTempDir("crew-migration-symlink-");
  ensureDir(paths(home).tapsDir);
  symlinkSync(outside, legacyTapPath("broken", home));
  writeFileSync(join(repo, "revision.txt"), "updated");
  commitAll(repo, "new revision");
  const updated = headSha(repo);
  expect(updated).not.toBe(before);

  const result = run(home, ["tap", "update", "broken", "healthy", "--json"]);
  expect(result.code).toBe(1);
  const parsed = JSON.parse(result.stdout) as { rows: { name: string; kind: string }[] };
  expect(parsed.rows.map(({ name, kind }) => ({ name, kind }))).toEqual([
    { name: "broken", kind: "failed" },
    { name: "healthy", kind: "refreshed" },
  ]);
  expect(headSha(clone)).toBe(updated);
  expect(existsSync(outside)).toBe(true);
});
