/**
 * When a bare `crew install` leaves the lockfile alone (§9.3): an entry
 * already there, a manifest that changed during the run, and an install
 * that did not fully succeed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LOCK_HEADER } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeSkill } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  crew,
  makeProject,
  makeSkillRepo,
  runBareInstallWithMidInstallHook,
  writeManifest,
} from "../helpers.ts";
import { dirOf, lockFile } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("leaving the lockfile alone", () => {
  test("C-RC-46 an entry another run published during this install is kept, not overwritten", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    const theirs = `${LOCK_HEADER}\n${"c".repeat(40)} ${repo}\n`;

    expect(
      runBareInstallWithMidInstallHook(home, project, () =>
        writeFileSync(lockFile(project), theirs),
      ),
    ).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(theirs);
  });

  test("C-RC-45 a manifest that changes during the run leaves the lockfile untouched", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(lockFile(project), "utf8");
    const beta = makeSkillRepo(["beta"]);
    writeManifest(project, [beta]);

    expect(
      runBareInstallWithMidInstallHook(home, project, () =>
        writeManifest(project, [beta, "./tools/x"]),
      ),
    ).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(before);
  });

  test("C-RC-45 a git source with one invalid skill leaves no lockfile behind", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    makeSkill(dirOf(repo), "broken", "name: broken");
    commitAll(dirOf(repo), "adds an invalid skill");
    const project = makeProject([repo]);

    expect(crew(home, project, ["install"]).code).toBe(1);

    expect(existsSync(lockFile(project))).toBe(false);
  });
});
