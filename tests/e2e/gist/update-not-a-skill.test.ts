/**
 * A whole-gist install whose file upstream no longer opens frontmatter
 * (§9 step 5, §10.1.1 step 3; C-UPD-16): the file is no longer a skill,
 * so its skill is gone — `source_gone`, the installed bytes kept — not an
 * invalid skill failing every update. One that still opens frontmatter
 * but whose `name` is invalid, or that crew can't read, is still there:
 * its update fails, naming why. (A file installed on its own is judged by
 * its own update: `./update-beside-whole.test.ts`.)
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { cloneDirForTap } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  GIST_PAGE_URL,
  GIST_TAP,
  json,
  run,
  skillFile,
  useGistFixture,
  writeGistFiles,
} from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-UPD-16 a gist file that no longer opens frontmatter is gone, not failing", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
  const home = makeCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  writeGistFiles(dir, { "prd.md": "Just notes now, no frontmatter.\n" });

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  const rows = json(r)
    .rows.map((row) => `${row.name}:${row.outcome.kind}`)
    .sort();
  // `build` moves to the new commit; `prd` is no longer a skill there.
  expect(rows).toEqual(["build:updated", "prd:source_gone"]);
  expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
});

test("C-UPD-16 a gist file whose frontmatter `name` is invalid is still there, so its update fails", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
  const home = makeCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  writeGistFiles(dir, { "prd.md": skillFile("Bad_Name") });

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(1);
  const body = json(r);
  expect(body.tap_reexpand_rows).toEqual([]);
  expect(body.rows.map((row) => `${row.name}:${row.outcome.kind}`).sort()).toEqual([
    "build:updated",
    "prd:failed",
  ]);
  const prdRow = body.rows.find((row) => row.name === "prd")!;
  expect(prdRow.outcome.error?.code).toBe("invalid_skill");
  expect(prdRow.outcome.error?.message).toContain("name");
  expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
});

test("C-UPD-16 a gist file crew can't read is still there, so its update fails", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
  const home = makeCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  const clonedPrd = join(cloneDirForTap(GIST_TAP, home)!, "prd.md");
  chmodSync(clonedPrd, 0o000);
  try {
    writeGistFiles(dir, { "build.md": skillFile("build", "Edited.\n") });
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const body = json(r);
    expect(body.tap_reexpand_rows).toEqual([]);
    const prdRow = body.rows.find((row) => row.name === "prd")!;
    expect([prdRow.outcome.kind, prdRow.outcome.error?.code]).toEqual([
      "failed",
      "source_unreachable",
    ]);
    expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
  } finally {
    chmodSync(clonedPrd, 0o644);
  }
});
