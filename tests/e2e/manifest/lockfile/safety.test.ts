/**
 * What a bare `crew install` refuses to do with a lockfile (§9.3): read or
 * write through anything at the lock path that is not a regular file, and
 * overwrite what another run or a changed manifest has made out of date.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { hasChangedOnDisk } from "../../../../src/commands/install/manifest/reconcile.ts";
import { loadManifestFor } from "../../../../src/manifest/index.ts";
import { LOCK_HEADER } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, installAnd, makeProject, makeSkillRepo, writeManifest } from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const lockFile = (project: string): string => join(project, ".crewrc.lock");

describe("lockfile safety", () => {
  for (const kind of ["a symbolic link", "a directory"] as const) {
    test(`C-RC-43 ${kind} at the lock path is manifest_invalid, and nothing is installed or changed`, () => {
      const home = makeCrewHome();
      const project = makeProject([makeSkillRepo(["alpha"])]);
      const target = join(makeTempDir("crew-target-"), "old.lock");
      writeFileSync(target, `${LOCK_HEADER}\n`);
      if (kind === "a directory") mkdirSync(lockFile(project));
      else symlinkSync(target, lockFile(project));

      const run = crew(home, project, ["install", "--json"]);

      expect(run.code).toBe(4);
      const { error } = JSON.parse(run.stdout) as { error: { name: string; message: string } };
      expect(error.name).toBe("manifest_invalid");
      expect(error.message).toContain("is not a regular file");
      expect(existsSync(join(project, ".claude"))).toBe(false);
      expect(readFileSync(target, "utf8")).toBe(`${LOCK_HEADER}\n`);
      const still = lstatSync(lockFile(project));
      expect(kind === "a directory" ? still.isDirectory() : still.isSymbolicLink()).toBe(true);
    });
  }

  test("C-RC-45 an entry another run published during this install is kept, not overwritten", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    const theirs = `${LOCK_HEADER}\n${"c".repeat(40)} ${repo}\n`;

    expect(installAnd(home, project, () => writeFileSync(lockFile(project), theirs))).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(theirs);
  });

  test("C-RC-44 a manifest that changes during the run leaves the lockfile untouched", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(lockFile(project), "utf8");
    const beta = makeSkillRepo(["beta"]);
    writeManifest(project, [beta]);

    expect(installAnd(home, project, () => writeManifest(project, [beta, "./tools/x"]))).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(before);
  });

  test("C-RC-44 the check that guards the lockfile sees an emptied manifest that was restored on disk", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(lockFile(project), "utf8");
    // The run reads an empty manifest; the file on disk lists alpha again.
    writeManifest(project, []);
    const emptied = loadManifestFor(project);
    writeManifest(project, [repo]);

    expect(hasChangedOnDisk(emptied!)).toBe(true);
    expect(readFileSync(lockFile(project), "utf8")).toBe(before);
  });

  test("C-RC-44 a git source with one invalid skill leaves no lockfile behind", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    makeSkill(repo.slice("file://".length), "broken", "name: broken");
    commitAll(repo.slice("file://".length), "adds an invalid skill");
    const project = makeProject([repo]);

    expect(crew(home, project, ["install"]).code).toBe(1);

    expect(existsSync(lockFile(project))).toBe(false);
  });
});
