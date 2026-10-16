/**
 * A whole-gist install whose file upstream no longer opens frontmatter
 * (§9 step 5, §10.1.1 step 3; C-UPD-16): the file is no longer a skill,
 * so its skill is gone — `source_gone`, the installed bytes kept — not an
 * invalid skill failing every update.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_PAGE_URL, json, run, skillFile, useGistFixture, writeGistFiles } from "./helpers.ts";

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
