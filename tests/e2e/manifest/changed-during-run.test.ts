/**
 * A `.crewrc` that changes while `crew install` is running (§9.2): the run
 * must not reconcile ownership on the strength of a manifest that is no
 * longer the one on disk.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  installed,
  makeProject,
  makeSkillRepo,
  ownedNames,
  runBareInstallWithMidInstallHook,
  writeManifest,
} from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/**
 * Run a bare install and rewrite `.crewrc` to `lines` (or delete it, for
 * `null`) partway through: after the manifest was read, before ownership is
 * reconciled.
 */
function installWhileManifestBecomes(
  home: string,
  project: string,
  lines: readonly string[] | null,
  extraArgs: readonly string[] = [],
) {
  const rewrite = (): void => {
    if (lines === null) rmSync(join(project, ".crewrc"));
    else writeManifest(project, lines);
  };
  return runBareInstallWithMidInstallHook(home, project, rewrite, extraArgs);
}

describe("a manifest that changes during the run", () => {
  const cases: readonly (readonly [string, () => string[] | null])[] = [
    ["is replaced by a different valid manifest", () => [makeSkillRepo(["beta"])]],
    ["becomes invalid", () => ["python-testing"]],
    ["is deleted", () => null],
  ];
  for (const [what, becomes] of cases) {
    test(`C-RC-31 when .crewrc ${what}, the run claims nothing and says so`, () => {
      const home = makeCrewHome();
      const project = makeProject([makeSkillRepo(["alpha"])]);

      const human = installWhileManifestBecomes(home, project, becomes());

      expect(human.hookRan).toBe(true);
      expect(human.code).toBe(0);
      expect(human.stderr).toContain("crew stopped bringing the project in line with it");
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
    expect(warnings.join("\n")).toContain("crew stopped bringing the project in line with it");
    expect(ownedNames(home)).toEqual([]);
  });
});
