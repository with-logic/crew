/**
 * Reading the project lockfile during a bare `crew install` (§9.3): a
 * locked line installs its recorded commit however far its source has
 * moved, and a lockfile that cannot be trusted stops the install.
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
import { LOCK_HEADER } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, writeManifest } from "../helpers.ts";
import { dirOf, headOf, lockFile } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const installedNote = (project: string): string =>
  readFileSync(join(project, ".claude", "skills", "alpha", "notes.md"), "utf8");

/** Commit a new `notes.md` for `alpha` in `repo`; returns the new commit. */
function publish(repo: string, note: string): string {
  writeFileSync(join(dirOf(repo), "alpha", "notes.md"), note);
  return commitAll(dirOf(repo), note);
}

/** Write a lockfile for `project` holding `entries` as `[commit, reference]` pairs. */
function writeLock(project: string, entries: readonly (readonly [string, string])[]): string {
  const text = [LOCK_HEADER, ...entries.map(([sha, ref]) => `${sha} ${ref}`), ""].join("\n");
  writeFileSync(lockFile(project), text);
  return text;
}

describe("reading the project lockfile", () => {
  test("C-RC-38 a locked line installs its recorded commit, not the one its source is at now", () => {
    const repo = makeSkillRepo(["alpha"]);
    const v1 = publish(repo, "v1\n");
    publish(repo, "v2\n");
    const project = makeProject([repo]);
    const lock = writeLock(project, [[v1, repo]]);

    expect(crew(makeCrewHome(), project, ["install"]).code).toBe(0);

    expect(installedNote(project)).toBe("v1\n");
    expect(readFileSync(lockFile(project), "utf8")).toBe(lock);
  });

  test("C-RC-38 a line with no lock entry installs as written, and no lockfile is created", () => {
    const repo = makeSkillRepo(["alpha"]);
    publish(repo, "v1\n");
    publish(repo, "v2\n");
    const project = makeProject([repo]);

    expect(crew(makeCrewHome(), project, ["install"]).code).toBe(0);

    expect(installedNote(project)).toBe("v2\n");
    expect(existsSync(lockFile(project))).toBe(false);
  });

  test("C-RC-39 a lock entry that changes moves the installed skill to the new commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const v1 = publish(repo, "v1\n");
    const v2 = publish(repo, "v2\n");
    const project = makeProject([repo]);
    writeLock(project, [[v1, repo]]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(installedNote(project)).toBe("v1\n");

    // As after pulling a commit that updated the lockfile.
    writeLock(project, [[v2, repo]]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(installedNote(project)).toBe("v2\n");
  });

  test("C-RC-40 entries that do not apply are ignored: an unlisted reference, and a line already pinned to a commit", () => {
    const repo = makeSkillRepo(["alpha"]);
    const v1 = publish(repo, "v1\n");
    publish(repo, "v2\n");
    const pinnedLine = `${repo}@${v1}`;
    const project = makeProject([pinnedLine]);
    // Neither commit below exists anywhere; using either would fail the install.
    writeLock(project, [
      ["d".repeat(40), makeSkillRepo(["beta"])],
      ["e".repeat(40), pinnedLine],
    ]);

    expect(crew(makeCrewHome(), project, ["install"]).code).toBe(0);

    expect(installedNote(project)).toBe("v1\n");
  });

  for (const kind of ["malformed text", "a symbolic link", "a directory"] as const) {
    test(`C-RC-41 ${kind} at the lock path is manifest_invalid, and nothing is installed or changed`, () => {
      const home = makeCrewHome();
      const repo = makeSkillRepo(["alpha"]);
      const project = makeProject([repo]);
      const target = join(makeTempDir("crew-target-"), "old.lock");
      writeFileSync(target, `${LOCK_HEADER}\n${headOf(repo)} ${repo}\n`);
      if (kind === "a directory") mkdirSync(lockFile(project));
      else if (kind === "a symbolic link") symlinkSync(target, lockFile(project));
      else writeFileSync(lockFile(project), "not a lockfile\n");
      const before = lstatSync(lockFile(project));

      const run = crew(home, project, ["install", "--json"]);

      expect(run.code).toBe(4);
      const { error } = JSON.parse(run.stdout) as {
        error: { name: string; details: Record<string, unknown> };
      };
      expect(error.name).toBe("manifest_invalid");
      expect(error.details).toEqual({ file: lockFile(project), line: 1 });
      expect(existsSync(join(project, ".claude"))).toBe(false);
      expect(lstatSync(lockFile(project)).mode).toBe(before.mode);
      expect(readFileSync(target, "utf8")).toContain(repo);
    });
  }

  test("C-RC-41 an invalid lockfile is an error even when the manifest declares nothing", () => {
    const project = makeProject([makeSkillRepo(["alpha"])]);
    writeManifest(project, []);
    writeFileSync(lockFile(project), "not a lockfile\n");

    expect(crew(makeCrewHome(), project, ["install"]).code).toBe(4);
  });
});
