/**
 * The manifest is confirmed again right before each deletion (§9.2).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  crew,
  installed,
  makeProject,
  makeSkillRepo,
  ownedNames,
  runBareInstallWithProgressHook,
  skillDir,
  writeManifest,
} from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

test("C-RC-33 a manifest replaced partway through the removals stops them there", () => {
  const home = makeCrewHome();
  const repo = makeSkillRepo(["alpha", "beta"]);
  const project = makeProject([repo]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  // gamma is installed by hand; the manifest this run reads names it and drops the other two.
  const gammaRepo = makeSkillRepo(["gamma"]);
  expect(crew(home, project, ["install", "--scope", "project", gammaRepo]).code).toBe(0);
  writeManifest(project, [gammaRepo]);
  const lockBefore = readFileSync(join(project, ".crewrc.lock"), "utf8");

  // While the first of the two is being removed, the manifest lists them again.
  const run = runBareInstallWithProgressHook(
    home,
    project,
    () => writeManifest(project, [repo]),
    ["--json"],
    /removing (alpha|beta) /,
  );

  expect(run).toMatchObject({ code: 0, hookRan: true });
  const left = ["alpha", "beta"].filter((name) => existsSync(skillDir(project, name)));
  expect(left).toHaveLength(1);
  const gone = left[0] === "alpha" ? "beta" : "alpha";
  const { removed, warnings } = JSON.parse(run.stdout) as {
    removed: { name: string; failures: unknown[] }[];
    warnings: string[];
  };
  expect(warnings.join("\n")).toContain("crew stopped bringing the project in line");
  expect(removed).toMatchObject([{ name: gone, failures: [] }]);
  expect(installed(home)).toEqual([...left, "gamma"].map((name) => `${name}@${project}`));
  // The interrupted run claimed nothing, and left the lockfile as it was.
  expect(ownedNames(home)).toEqual(left);
  expect(readFileSync(join(project, ".crewrc.lock"), "utf8")).toBe(lockBefore);
});
