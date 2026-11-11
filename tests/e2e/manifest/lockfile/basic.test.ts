/**
 * The project lockfile during a bare `crew install` (§9.3): when it is
 * written, what it records, and that a locked line installs the recorded
 * commit however far its source has moved.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "../../../../src/git/exec.ts";
import { LOCK_HEADER, parseLock } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { addLocalSkill, crew, makeProject, makeSkillRepo, writeManifest } from "../helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

const lockFile = (project: string): string => join(project, ".crewrc.lock");
const dirOf = (repo: string): string => repo.slice("file://".length);
const headOf = (repo: string): string =>
  runGit(["rev-parse", "HEAD"], { cwd: dirOf(repo) }).stdout.trim();
const installedNote = (project: string): string =>
  readFileSync(join(project, ".claude", "skills", "alpha", "notes.md"), "utf8");

/** Commit a new `notes.md` for `alpha` in `repo`; returns the new commit. */
function publish(repo: string, note: string): string {
  writeFileSync(join(dirOf(repo), "alpha", "notes.md"), note);
  return commitAll(dirOf(repo), note);
}

describe("the project lockfile", () => {
  test("C-RC-38 the first install records each git line's commit, and nothing for a path line", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo, "./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(
      `${LOCK_HEADER}\n${headOf(repo)} ${repo}\n`,
    );
  });

  test("C-RC-38 a line naming one skill in a repository locks that repository's commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha", "beta"]);
    const other = makeSkillRepo(["gamma"]);
    const project = makeProject([other, `${repo}//beta`]);

    expect(crew(home, project, ["install"]).code).toBe(0);

    const text = readFileSync(lockFile(project), "utf8");
    expect(parseLock({ text, file: lockFile(project) })).toEqual(
      new Map([
        [`${repo}//beta`, headOf(repo)],
        [other, headOf(other)],
      ]),
    );
  });

  test("C-RC-38 a project with nothing to lock gets no lockfile", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject(["./tools/gamma", `${repo}@${headOf(repo)}`]);
    addLocalSkill(project, "tools", "gamma");

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(existsSync(lockFile(project))).toBe(false);
  });

  test("C-RC-39 a locked line installs its recorded commit on a machine that has never seen it", () => {
    const repo = makeSkillRepo(["alpha"]);
    const v1 = publish(repo, "v1\n");
    const project = makeProject([repo]);
    expect(crew(makeCrewHome(), project, ["install"]).code).toBe(0);
    const lockText = readFileSync(lockFile(project), "utf8");
    publish(repo, "v2\n");

    // A teammate's checkout: same manifest and lockfile, their own crew home.
    const theirs = makeProject([repo]);
    writeFileSync(lockFile(theirs), lockText);
    expect(crew(makeCrewHome(), theirs, ["install"]).code).toBe(0);

    expect(installedNote(theirs)).toBe("v1\n");
    expect(readFileSync(lockFile(theirs), "utf8")).toBe(`${LOCK_HEADER}\n${v1} ${repo}\n`);
  });

  test("C-RC-40 a lock entry that changes moves the installed skill to the new commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    publish(repo, "v1\n");
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const v2 = publish(repo, "v2\n");

    // As after pulling a commit that updated the lockfile.
    writeFileSync(lockFile(project), `${LOCK_HEADER}\n${v2} ${repo}\n`);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(installedNote(project)).toBe("v2\n");
  });

  test("C-RC-42 a repeat install does not rewrite the lockfile, and --dry-run never writes one", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);

    expect(crew(home, project, ["install", "--dry-run"]).code).toBe(0);
    expect(existsSync(lockFile(project))).toBe(false);

    expect(crew(home, project, ["install"]).code).toBe(0);
    writeFileSync(lockFile(project), `${readFileSync(lockFile(project), "utf8")}# kept\n`);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(readFileSync(lockFile(project), "utf8")).toContain("# kept\n");
  });

  test("C-RC-43 an invalid lockfile is manifest_invalid and nothing is installed", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    writeFileSync(lockFile(project), "not a lockfile\n");

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(4);
    const { error } = JSON.parse(run.stdout) as {
      error: { name: string; details: Record<string, unknown> };
    };
    expect(error.name).toBe("manifest_invalid");
    expect(error.details).toEqual({ file: lockFile(project), line: 1 });
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  test("C-RC-44 a failed install leaves the lockfile as it was", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(lockFile(project), "utf8");

    writeManifest(project, [repo, makeSkillRepo(["beta"]), "./tools/absent"]);
    expect(crew(home, project, ["install"]).code).toBe(4);

    expect(readFileSync(lockFile(project), "utf8")).toBe(before);
  });

  test("C-RC-38 two lines naming one repository at different refs each record their own commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha", "beta"]);
    const old = headOf(repo);
    runGit(["-c", "tag.gpgSign=false", "tag", "v1"], { cwd: dirOf(repo) });
    const latest = publish(repo, "after v1\n");
    const project = makeProject([`${repo}//alpha`, `${repo}@v1//beta`]);

    expect(crew(home, project, ["install"]).code).toBe(0);

    const text = readFileSync(lockFile(project), "utf8");
    expect(parseLock({ text, file: lockFile(project) })).toEqual(
      new Map([
        [`${repo}//alpha`, latest],
        [`${repo}@v1//beta`, old],
      ]),
    );
  });
});
