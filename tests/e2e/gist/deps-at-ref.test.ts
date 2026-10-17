/**
 * Dependencies of a gist installed at a commit (§9 steps 3 and 6;
 * C-INST-27): every parent's siblings are read at that commit, from one
 * export made for the whole install however many parents ask, and
 * deleted when the install ends — or, where crew can't delete it, left
 * without changing the install's outcome (C-INST-05i).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { paths } from "../../../src/core/paths.ts";
import { setGitRunner } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_PAGE_URL, run, skillFile, useGistFixture } from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-INST-27 a gist at a commit is exported once for every parent's dependencies", () => {
  const { sha } = fx.gist({
    "a.md": skillFile("a", "A.\n", ["shared"]),
    "b.md": skillFile("b", "B.\n", ["shared"]),
    "c.md": skillFile("c", "C.\n", ["shared"]),
    "shared.md": skillFile("shared"),
  });
  const home = makeCrewHome();
  let exports = 0;
  const served = setGitRunner((args, options) => {
    if (args.some((a) => a.startsWith("--work-tree="))) exports++;
    return served(args, options);
  });

  expect(run(home, ["install", `${GIST_PAGE_URL}@${sha}`]).code).toBe(0);
  const installed = readState(home)
    .installations.map((e) => `${e.name}@${e.ref}`)
    .sort();
  expect(installed).toEqual(["a", "b", "c", "shared"].map((name) => `${name}@${sha}`));
  // One export expands the gist; one serves all three parents' siblings.
  expect(exports).toBe(2);
  const scratch = paths(home).gitCacheDir;
  expect(existsSync(scratch) ? readdirSync(scratch) : []).toEqual([]);
});

for (const [which, nth] of [
  ["the root expansion's", 1],
  ["the siblings'", 2],
] as const) {
  test(`C-INST-27 C-INST-05i ${which} export crew can't remove is left, and the install still succeeds`, () => {
    const { sha } = fx.gist({
      "a.md": skillFile("a", "A.\n", ["shared"]),
      "shared.md": skillFile("shared"),
    });
    const home = makeCrewHome();
    const scratch = paths(home).gitCacheDir;
    let exports = 0;
    let sealed = "";
    const served = setGitRunner((args, options) => {
      const result = served(args, options);
      // Once that export is checked out, crew can still read it but can't
      // remove what's in it.
      const workTree = args.find((a) => a.startsWith("--work-tree="));
      if (workTree && ++exports === nth) {
        sealed = workTree.slice("--work-tree=".length);
        chmodSync(sealed, 0o555);
      }
      return result;
    });
    let r: ReturnType<typeof run>;
    try {
      r = run(home, ["install", `${GIST_PAGE_URL}@${sha}`, "--verbose"]);
    } finally {
      if (sealed) chmodSync(sealed, 0o755);
    }
    expect(r.code).toBe(0);
    expect(
      readState(home)
        .installations.map((e) => e.name)
        .sort(),
    ).toEqual(["a", "shared"]);
    // The one export left is the sealed one, and nothing else is.
    expect(existsSync(sealed)).toBe(true);
    expect(readdirSync(scratch)).toHaveLength(1);
    expect(r.stderr).toContain(`left the scratch export \`${sealed}\``);
    expect(r.stderr).toContain("`crew cache clean` removes it");
  });
}
