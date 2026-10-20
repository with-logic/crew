/**
 * A git clone whose root crew can search but not list (§9 step 5, "Folder
 * links"; C-SPEC-17, C-SPEC-18): discovery only looks names up there —
 * `skills/` is listed, the root never is — so its skills install, and on
 * update a new one is picked up; nothing fails as an unexpected error.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setGitRunner } from "../../../src/git/exec.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, gitRepo, skillAt } from "./folder-links/helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/**
 * Seal every clone crew makes between git's own steps — crew can look
 * names up in it, but not list it — and open it for git, which lists.
 */
function sealClones(): { readonly open: () => void } {
  const clones: string[] = [];
  const setAll = (mode: number): void => {
    // A clone that failed (the test home's unreachable `core` tap) isn't there.
    for (const clone of clones) if (existsSync(clone)) chmodSync(clone, mode);
  };
  const served = setGitRunner((args, options) => {
    setAll(0o755);
    const result = served(args, options);
    if (args[0] === "clone") clones.push(args[args.length - 1]!);
    setAll(0o300);
    return result;
  });
  return { open: () => setAll(0o755) };
}

test("C-SPEC-18 a clone root crew can't list still installs its skills/", () => {
  const repo = gitRepo((r) => skillAt(join(r, "skills"), "good"));
  const sealed = sealClones();
  let r: ReturnType<typeof crew>;
  try {
    r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  } finally {
    sealed.open();
  }
  expect(r.out).not.toContain("unexpected error");
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
});

test("C-SPEC-18 a tap whose clone root crew can't list resolves <tap>/<skill> and updates", () => {
  const repo = gitRepo((r) => skillAt(join(r, "skills"), "good"));
  const home = makeCrewHome();
  const sealed = sealClones();
  try {
    expect(crew(home, ["tap", "add", `file://${repo}`, "mine"]).code).toBe(0);
    const one = crew(home, ["install", "mine/good"]);
    expect([one.code, one.out.includes("unexpected error")]).toEqual([0, false]);
    expect(crew(home, ["install", "mine"]).code).toBe(0);
    skillAt(join(repo, "skills"), "fresh");
    commitAll(repo, "add fresh");
    // Whether crew can also check the installed copy's own path there
    // depends on the platform; either way each skill's outcome is crew's.
    expect(crew(home, ["update"]).out).not.toContain("unexpected error");
  } finally {
    sealed.open();
  }
  expect(readdirSync(claude.userRoot).sort()).toEqual(["fresh", "good"]);
});
