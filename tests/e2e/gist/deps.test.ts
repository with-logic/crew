/**
 * A gist skill's dependency on a sibling file that crew can't read fails
 * the install with that reason, naming the dependency, and is never taken
 * from another tap (§9 step 6; C-SPEC-16). A gist sibling is named for
 * the dependency by its file name without `.md`.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoClonePath } from "../../../src/core/repo-path.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_CLONE_URL, GIST_PAGE_URL, json, run, skillFile, useGistFixture } from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-SPEC-16 a gist dependency file crew can't read is never taken from another tap", () => {
  fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build", "Build.\n", ["prd"]) });
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "prd", skillFrontmatter({ name: "prd" }));
  const home = makeCrewHome();
  expect(run(home, ["tap", "add", other, "other"]).code).toBe(0);
  expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
  const prd = join(repoClonePath(GIST_CLONE_URL, home), "prd.md");
  chmodSync(prd, 0o000);
  try {
    const r = run(home, ["install", `${GIST_PAGE_URL}//build.md`, "--json"]);
    expect([r.code, json(r).error.name]).toEqual([5, "source_unreachable"]);
    expect(json(r).error.message).toMatch(/^dependency `prd`: couldn't read `\S+\/prd\.md`/);
    expect(json(r).error.details["dependency"]).toBe("prd");
  } finally {
    chmodSync(prd, 0o644);
  }
  expect(readdirSync(claude.userRoot)).toEqual([]);
});
