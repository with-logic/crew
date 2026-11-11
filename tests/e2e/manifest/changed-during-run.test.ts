/**
 * A `.crewrc` that changes while `crew install` is running (§9.2): the run
 * must not reconcile ownership on the strength of a manifest that is no
 * longer the one on disk.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { installed, makeProject, makeSkillRepo, ownedNames, writeManifest } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/**
 * Run a verbose bare install and rewrite `.crewrc` to `lines` the moment
 * the first skill starts installing — after the manifest was read, before
 * ownership is reconciled.
 */
function installWhileManifestBecomes(
  home: string,
  project: string,
  lines: readonly string[],
  extraArgs: readonly string[] = [],
) {
  let rewritten = false;
  let stdout = "";
  let stderr = "";
  const code = runCli(["install", "--verbose", ...extraArgs], {
    home,
    cwd: project,
    streams: {
      stdout: (chunk) => {
        stdout += chunk;
      },
      stderr: (chunk) => {
        stderr += chunk;
        if (rewritten || !chunk.includes("installing")) return;
        rewritten = true;
        writeManifest(project, lines);
      },
    },
  });
  return { code, stdout, stderr, rewritten };
}

describe("a manifest that changes during the run", () => {
  const cases: readonly (readonly [string, () => string[]])[] = [
    ["is replaced by a different valid manifest", () => [makeSkillRepo(["beta"])]],
    ["becomes invalid", () => ["python-testing"]],
  ];
  for (const [what, becomes] of cases) {
    test(`C-RC-31 when .crewrc ${what}, the run claims nothing and says so`, () => {
      const home = makeCrewHome();
      const project = makeProject([makeSkillRepo(["alpha"])]);

      const human = installWhileManifestBecomes(home, project, becomes());

      expect(human.rewritten).toBe(true);
      expect(human.code).toBe(0);
      expect(human.stderr).toContain(".crewrc changed while crew was installing");
      expect(installed(home)).toEqual([`alpha@${project}`]);
      expect(ownedNames(home)).toEqual([]);
    });
  }

  test("C-RC-31 the --json result carries the warning in `warnings`", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);

    const run = installWhileManifestBecomes(home, project, [], ["--json"]);

    expect(run.code).toBe(0);
    const { warnings } = JSON.parse(run.stdout) as { warnings: string[] };
    expect(warnings.join("\n")).toContain(".crewrc changed while crew was installing");
    expect(ownedNames(home)).toEqual([]);
  });
});
