/**
 * A `.crewrc` that changes while `crew install` is running (§9.2): the run
 * must not claim or remove anything on the strength of a manifest that is
 * no longer the one on disk. Two overlapping installs reading different
 * versions would otherwise remove each other's skills.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { runCli } from "../../../src/cli/main.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  ownedNames,
  skillDir,
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
 * Run a verbose bare install and rewrite `.crewrc` to `lines` the moment
 * the first skill starts installing — after the manifest was read, before
 * ownership is reconciled.
 */
function installWhileManifestBecomes(home: string, project: string, lines: readonly string[]) {
  let rewritten = false;
  let stderr = "";
  const code = runCli(["install", "--verbose"], {
    home,
    cwd: project,
    streams: {
      stdout: () => {},
      stderr: (chunk) => {
        stderr += chunk;
        if (rewritten || !chunk.includes("installing")) return;
        rewritten = true;
        writeManifest(project, lines);
      },
    },
  });
  return { code, stderr, rewritten };
}

describe("a manifest that changes during the run", () => {
  const cases: readonly (readonly [string, (alphaRepo: string) => string[]])[] = [
    ["is replaced by a different valid manifest", (alphaRepo) => [alphaRepo]],
    ["becomes invalid", () => ["python-testing"]],
  ];
  for (const [what, becomes] of cases) {
    test(`C-RC-36 when .crewrc ${what}, nothing is claimed or removed and the run says so`, () => {
      const home = makeCrewHome();
      const alphaRepo = makeSkillRepo(["alpha"]);
      const project = makeProject([alphaRepo]);
      expect(crew(home, project, ["install"]).code).toBe(0);
      expect(ownedNames(home)).toEqual(["alpha"]);
      writeManifest(project, [makeSkillRepo(["beta"])]);

      const run = installWhileManifestBecomes(home, project, becomes(alphaRepo));

      expect(run.rewritten).toBe(true);
      expect(run.code).toBe(0);
      expect(run.stderr).toContain(".crewrc changed while crew was installing");
      // alpha's line was "dropped" by the manifest this run read, yet it stays.
      expect(existsSync(skillDir(project, "alpha"))).toBe(true);
      expect(installed(home)).toEqual([`alpha@${project}`, `beta@${project}`]);
      expect(ownedNames(home)).toEqual(["alpha"]);
    });
  }
});
