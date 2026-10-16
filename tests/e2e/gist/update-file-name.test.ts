/**
 * A gist `//<file>` entry is matched by its exact name on update, case
 * included (§9 step 5, §10.1; C-UPD-40): an upstream rename that only
 * changes case leaves the recorded file gone — on a case-insensitive
 * filesystem as on any other — rather than updating from a file whose
 * name state no longer records.
 *
 * Only a case-insensitive filesystem (macOS by default) can tell this
 * apart from a plain deletion: on Linux the lookup fails either way, so
 * there this test passes with or without the exact-name guard.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_PAGE_URL, json, run, skillFile, useGistFixture } from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-UPD-40 a gist file renamed upstream only in case is source_gone", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd") });
  const home = makeCrewHome();
  expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
  // Staged by hand: git on a case-insensitive filesystem won't see it.
  runGit(["rm", "--cached", "--quiet", "prd.md"], { cwd: dir });
  rmSync(join(dir, "prd.md"));
  writeFileSync(join(dir, "PRD.md"), skillFile("prd", "Renamed.\n"));
  commitAll(dir, "rename prd.md to PRD.md");

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  expect(json(r).rows.map((row) => `${row.name}:${row.outcome.kind}`)).toEqual(["prd:source_gone"]);
  expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
  expect(readState(home).installations.map((e) => e.source.path)).toEqual(["prd.md"]);
});
