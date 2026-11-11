/**
 * What a bare `crew install` refuses to do with a lockfile (§9.3): read or
 * write through anything at the lock path that is not a regular file, and
 * overwrite what another run or a changed manifest has made out of date.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { LOCK_HEADER } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, writeManifest } from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const lockFile = (project: string): string => join(project, ".crewrc.lock");

/** Run a verbose bare install, calling `during` once when the first skill starts installing. */
function installAnd(home: string, project: string, during: () => void): number {
  let done = false;
  return runCli(["install", "--verbose"], {
    home,
    cwd: project,
    streams: {
      stdout: () => {},
      stderr: (chunk) => {
        if (done || !chunk.includes("installing")) return;
        done = true;
        during();
      },
    },
  });
}

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
      if (kind === "a symbolic link") expect(readlinkSync(lockFile(project))).toBe(target);
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
});
