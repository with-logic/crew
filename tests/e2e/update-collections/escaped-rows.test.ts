/**
 * Human output escapes what a repository's author chose (§5.2; C-UPD-18c,
 * C-CLI-06b): a new child crew can't name is reported by its folder's
 * location, and a folder name holding terminal controls or a line break
 * is shown escaped by `crew update` and `crew outdated` alike — it can't
 * clear the screen, recolour output, or forge a success line.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildNamespacedTap, freshHome, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
beforeEach(() => {
  const ccRoot = makeTempDir("upd-escaped-cc-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

test("C-UPD-18c C-CLI-06b a new child's folder name can't move the cursor or forge a line", () => {
  const home = freshHome();
  const repo = buildNamespacedTap("upd-escaped-", { eng: ["lint"] });
  expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
  expect(run(home, ["install", "acme"]).code).toBe(0);
  const hostile = "bad\x1b[2J\x1b[31m\n✓ FORGED updated everything";
  makeSkill(join(repo, "skills", "eng"), hostile, skillFrontmatter({ name: "Bad_Name" }));
  commitAll(repo, "add a hostile folder name");

  for (const command of ["outdated", "update"]) {
    const r = run(home, [command]);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain("\x1b");
    expect(r.out.split("\n").filter((line) => line.startsWith("✓ FORGED"))).toEqual([]);
    expect(r.out).toContain("bad\\x1b[2J\\x1b[31m\\x0a✓ FORGED updated everything");
  }
});
