/**
 * Resolving several new sources in one install (§9 steps 1–5, §14): the
 * taps the references name are locked from the start, so the work grows
 * with the number of sources, not with its square. Real local git
 * repositories; git commands are counted, not replaced.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setGitRunner } from "../../../src/git/exec.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, installed, makeProject, makeSkillRepo } from "../manifest/helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** How many git commands a bare install of `count` new single-skill sources runs. */
function gitCommandsToInstall(count: number, prefix: string): number {
  const home = makeCrewHome();
  const lines = Array.from({ length: count }, (_, i) => makeSkillRepo([`${prefix}${i}`]));
  const project = makeProject(lines);
  let commands = 0;
  const real = setGitRunner((args, options) => {
    commands += 1;
    return real(args, options);
  });
  const run = crew(home, project, ["install"]);
  setGitRunner(real);
  return run.code === 0 && installed(home).length === count ? commands : Number.NaN;
}

describe("several new sources in one install", () => {
  test("twice as many new sources cost twice the git commands, not four times", () => {
    const three = gitCommandsToInstall(3, "few");
    const six = gitCommandsToInstall(6, "many");

    expect(three).toBeGreaterThan(0);
    // One command is run once per install; the rest are per source.
    expect(six).toBe(2 * three - 1);
  });

  test("a reference that does not parse is still reported, after the sources before it", () => {
    const home = makeCrewHome();
    const project = makeProject([]);
    const args = [
      "install",
      "--scope",
      "project",
      makeSkillRepo(["alpha"]),
      "not a ref!",
      "--json",
    ];

    const run = crew(home, project, args);

    expect(run.code).toBe(4);
    expect((JSON.parse(run.stdout) as { error: { name: string } }).error.name).toBe("invalid_ref");
  });
});
