/**
 * A tracked tap whose `skills/` folder crew can't list, on `crew update`
 * (§10.1.1; C-SPEC-18): that tap's group fails as a `tap_error` for each
 * member while the rest of the run proceeds — another tap's new child is
 * installed and recorded — and the run exits 1.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { run } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** A path tap `name` holding `skills/<skill>`, installed whole; its folder. Throws when that fails. */
function trackedTap(home: string, name: string, skill: string): string {
  const dir = makeTempDir();
  makeSkill(join(dir, "skills"), skill, skillFrontmatter({ name: skill }));
  for (const args of [
    ["tap", "add", dir, name],
    ["install", name],
  ]) {
    if (run(home, args).code !== 0) throw new Error(`crew ${args.join(" ")} failed`);
  }
  return dir;
}

test("C-SPEC-18 a tap whose skills/ crew can't list fails alone; another tap's new child is recorded", () => {
  const home = makeCrewHome();
  const first = trackedTap(home, "ta", "x");
  const second = trackedTap(home, "tb", "w");
  makeSkill(join(first, "skills"), "y", skillFrontmatter({ name: "y" }));
  chmodSync(join(second, "skills"), 0o000);
  let r: { code: number; stdout: string };
  try {
    r = run(home, ["update", "--json"]);
  } finally {
    chmodSync(join(second, "skills"), 0o755);
  }
  expect(r.code).toBe(1);
  const rows = JSON.parse(r.stdout).tap_reexpand_rows.map(
    (row: { name: string; kind: string; error?: { code: string } }) =>
      `${row.name}:${row.kind}:${row.error?.code ?? ""}`,
  );
  expect(rows.sort()).toEqual(["w:tap_error:source_unreachable", "y:added:"]);
  expect(existsSync(join(claude.userRoot, "y"))).toBe(true);
  expect(
    readState(home)
      .installations.map((e) => e.name)
      .sort(),
  ).toEqual(["w", "x", "y"]);
});

test("C-SPEC-18 a tap that fails as a whole reads as one failure, with its next step", () => {
  const home = makeCrewHome();
  const tapDir = trackedTap(home, "tb", "w");
  makeSkill(join(tapDir, "skills"), "v", skillFrontmatter({ name: "v" }));
  expect(run(home, ["install", "tb"]).code).toBe(0);
  // Searchable, not listable: `v` and `w` still update; the tap can't be re-expanded.
  chmodSync(join(tapDir, "skills"), 0o311);
  let human: { code: number; stdout: string };
  let json: { tap_reexpand_rows: { whole_group?: boolean; error: { remedy?: string } }[] };
  try {
    human = run(home, ["update"]);
    json = JSON.parse(run(home, ["update", "--json"]).stdout);
  } finally {
    chmodSync(join(tapDir, "skills"), 0o755);
  }
  expect(human.code).toBe(1);
  const lines = human.stdout.split("\n");
  expect(lines.filter((l) => l.includes("couldn't re-expand tap tb (2 skills)"))).toHaveLength(1);
  expect(lines.some((l) => l.includes("(from tb)"))).toBe(false);
  expect(human.stdout).toContain("Check that it is readable by you");
  expect(human.stdout).toContain("2 up to date · 1 failure");
  // `--json` keeps a row per member, each marked as the tap's.
  const rows = json.tap_reexpand_rows;
  expect(rows.map((row) => [row.whole_group, row.error.remedy])).toEqual([
    [true, expect.stringContaining("readable by you")],
    [true, expect.stringContaining("readable by you")],
  ]);
});

test("C-SPEC-18 crew outdated never calls a tap it couldn't re-expand up to date", () => {
  const home = makeCrewHome();
  // The test home's unreachable `core` tap would mark the run unchecked on its own.
  expect(run(home, ["tap", "remove", "core", "--force"]).code).toBe(0);
  const tapDir = trackedTap(home, "tb", "w");
  chmodSync(join(tapDir, "skills"), 0o311);
  let out: string;
  try {
    out = run(home, ["outdated"]).stdout.replace(/\s+/g, " ");
  } finally {
    chmodSync(join(tapDir, "skills"), 0o755);
  }
  expect(out).toContain("couldn't re-expand tap tb (1 skill)");
  expect(out).toContain(
    "Nothing known to be out of date, but some collections couldn't be checked.",
  );
  expect(out).not.toContain("Everything is up to date");
});
