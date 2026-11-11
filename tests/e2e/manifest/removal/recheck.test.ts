/**
 * Checks repeated right before each deletion (§9.2): the manifest must
 * still be current, and the install directory still the project's own.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
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

test("C-RC-33 a manifest replaced during the last removal means no lockfile write and no claim", () => {
  const home = makeCrewHome();
  const repo = makeSkillRepo(["alpha"]);
  const project = makeProject([repo]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  const gammaRepo = makeSkillRepo(["gamma"]);
  expect(crew(home, project, ["install", "--scope", "project", gammaRepo]).code).toBe(0);
  writeManifest(project, [gammaRepo]);
  const lockBefore = readFileSync(join(project, ".crewrc.lock"), "utf8");

  // alpha is the only removal: nothing checks the manifest after it but the final confirmation.
  const run = runBareInstallWithProgressHook(
    home,
    project,
    () => writeManifest(project, [gammaRepo, "./tools/later"]),
    [],
    /removing alpha /,
  );

  expect(run).toMatchObject({ code: 0, hookRan: true });
  expect(run.stderr).toContain("crew stopped bringing the project in line");
  expect(installed(home)).toEqual([`gamma@${project}`]);
  expect(ownedNames(home)).toEqual([]);
  expect(readFileSync(join(project, ".crewrc.lock"), "utf8")).toBe(lockBefore);
});

test("C-RC-30 a directory that becomes a link after the pre-checks is still not deleted", () => {
  const home = makeCrewHome();
  const project = makeProject([makeSkillRepo(["alpha", "beta"])]);
  expect(crew(home, project, ["install"]).code).toBe(0);
  writeManifest(project, []);
  const elsewhere = makeTempDir("crew-elsewhere-");

  // While the first of the two is being removed, swap the other's directory for a link.
  const swapTheOther = (): void => {
    const [other] = ["alpha", "beta"].filter((name) =>
      existsSync(join(skillDir(project, name), ".crew.json")),
    ) as [string];
    renameSync(skillDir(project, other), join(elsewhere, other));
    symlinkSync(join(elsewhere, other), skillDir(project, other));
  };
  const run = runBareInstallWithProgressHook(
    home,
    project,
    swapTheOther,
    [],
    /removing (alpha|beta) /,
  );

  expect(run).toMatchObject({ code: 0, hookRan: true });
  const kept = ["alpha", "beta"].filter((name) => existsSync(join(elsewhere, name, "SKILL.md")));
  expect(kept).toHaveLength(1);
  expect(run.stderr).toContain(`kept \`${kept[0]}\``);
  expect(installed(home)).toEqual([`${kept[0]}@${project}`]);
});
