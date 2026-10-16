/**
 * A skill installed by tracking its whole tap, whose SKILL.md upstream
 * becomes a link crew won't follow, fails its update as `invalid_skill`
 * — it is still there, so not "removed upstream" (§10.1, §10.1.1 step 3;
 * C-UPD-40). An absolute link worked before this rule (main, v0.10.1).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { run } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-UPD-40 a tracked skill whose SKILL.md became an absolute link fails, not gone", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  const demo = makeSkill(
    join(tapDir, "skills"),
    "demo",
    skillFrontmatter({ name: "demo" }),
    "Original.\n",
  );
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  renameSync(join(demo, "SKILL.md"), join(demo, "body.md"));
  symlinkSync(join(demo, "body.md"), join(demo, "SKILL.md"));

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(1);
  const out = JSON.parse(r.stdout);
  expect(out.tap_reexpand_rows).toEqual([]);
  const [row] = out.rows;
  expect([row.name, row.outcome.kind, row.outcome.error.code]).toEqual([
    "demo",
    "failed",
    "invalid_skill",
  ]);
  expect(readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8")).toContain("Original.");
});
