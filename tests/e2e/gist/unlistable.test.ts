/**
 * A gist checkout crew can't list (§9 step 5; C-SPEC-18): installing the
 * gist is `source_unreachable` naming the checkout, never an unexpected
 * error — its files can't be told apart from no files at all.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { setGitRunner } from "../../../src/git/exec.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_PAGE_URL, json, run, skillFile, useGistFixture } from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-SPEC-18 a gist checkout crew can't list is source_unreachable", () => {
  fx.gist({ "prd.md": skillFile("prd") });
  const home = makeCrewHome();
  let clone: string | undefined;
  // Between git's own steps the checkout is sealed — crew can look things
  // up in it, but not list it — and git, which needs to, gets it open.
  const served = setGitRunner((args, options) => {
    if (clone) chmodSync(clone, 0o755);
    const result = served(args, options);
    if (args[0] === "clone") clone = args[args.length - 1];
    if (clone && existsSync(clone)) chmodSync(clone, 0o300);
    return result;
  });
  let r: ReturnType<typeof run>;
  try {
    r = run(home, ["install", GIST_PAGE_URL, "--json"]);
  } finally {
    if (clone) chmodSync(clone, 0o755);
  }
  const { error } = json(r) as { error: { name: string; message: string } };
  expect([r.code, error.name]).toEqual([5, "source_unreachable"]);
  expect(error.message).toContain(`couldn't read \`${clone}\``);
  expect(readdirSync(claude.userRoot)).toEqual([]);
});
