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

/** A bare install of `count` new single-skill sources: its exit code, what it installed, and how many git commands it ran. */
function installNewSources(count: number, prefix: string) {
  const home = makeCrewHome();
  const lines = Array.from({ length: count }, (_, i) => makeSkillRepo([`${prefix}${i}`]));
  const project = makeProject(lines);
  let gitCommandCount = 0;
  const real = setGitRunner((args, options) => {
    gitCommandCount += 1;
    return real(args, options);
  });
  const run = crew(home, project, ["install"]);
  setGitRunner(real);
  return {
    code: run.code,
    stderr: run.stderr,
    installedCount: installed(home).length,
    gitCommandCount,
  };
}

describe("several new sources in one install", () => {
  test("twice as many new sources cost twice the git commands, not four times", () => {
    const threeSources = installNewSources(3, "few");
    const sixSources = installNewSources(6, "many");

    expect(threeSources).toMatchObject({ code: 0, stderr: "", installedCount: 3 });
    expect(sixSources).toMatchObject({ code: 0, stderr: "", installedCount: 6 });
    // One command is run once per install; the rest are per source.
    expect(sixSources.gitCommandCount).toBe(2 * threeSources.gitCommandCount - 1);
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
