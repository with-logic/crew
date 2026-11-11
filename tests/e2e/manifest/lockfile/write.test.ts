/**
 * Writing the project lockfile during a bare `crew install` (§9.3): when
 * it is written and what it records.
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
import { dirOf, headSha, lockFile } from "./helpers.ts";

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

describe("writing the project lockfile", () => {
  test("C-RC-42 the first install records each git line's commit, and nothing for a path line", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo, "./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(
      `${LOCK_HEADER}\n${headSha(repo)} ${repo}\n`,
    );
  });

  test("C-RC-42 a line naming one skill in a repository locks that repository's commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha", "beta"]);
    const other = makeSkillRepo(["gamma"]);
    const project = makeProject([other, `${repo}//beta`]);

    expect(crew(home, project, ["install"]).code).toBe(0);

    const text = readFileSync(lockFile(project), "utf8");
    expect(parseLock({ text, file: lockFile(project) })).toEqual(
      new Map([
        [`${repo}//beta`, headSha(repo)],
        [other, headSha(other)],
      ]),
    );
  });

  test("C-RC-42 two lines that reach one skill at one commit under different refs both get an entry", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([`${repo}//alpha`, `${repo}@main//alpha`]);

    expect(crew(home, project, ["install"]).code).toBe(0);

    const text = readFileSync(lockFile(project), "utf8");
    expect(parseLock({ text, file: lockFile(project) })).toEqual(
      new Map([
        [`${repo}//alpha`, headSha(repo)],
        [`${repo}@main//alpha`, headSha(repo)],
      ]),
    );
  });

  test("C-RC-42 a project with nothing to lock gets no lockfile", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject(["./tools/gamma", `${repo}@${headSha(repo)}`]);
    addLocalSkill(project, "tools", "gamma");

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(existsSync(lockFile(project))).toBe(false);
  });

  test("C-RC-42 the lockfile one install writes makes another machine install the same commit", () => {
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

  test("C-RC-44 a repeat install does not rewrite the lockfile, and --dry-run never writes one", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);

    expect(crew(home, project, ["install", "--dry-run"]).code).toBe(0);
    expect(existsSync(lockFile(project))).toBe(false);

    expect(crew(home, project, ["install"]).code).toBe(0);
    const annotated = `${readFileSync(lockFile(project), "utf8")}# kept\n`;
    writeFileSync(lockFile(project), annotated);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(crew(home, project, ["install", "--dry-run"]).code).toBe(0);
    expect(readFileSync(lockFile(project), "utf8")).toBe(annotated);
  });

  test("C-RC-45 a failed install leaves the lockfile as it was", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readFileSync(lockFile(project), "utf8");

    writeManifest(project, [repo, makeSkillRepo(["beta"]), "./tools/absent"]);
    expect(crew(home, project, ["install"]).code).toBe(4);

    expect(readFileSync(lockFile(project), "utf8")).toBe(before);
  });

  test("C-RC-42 two lines naming one repository at different refs each record their own commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha", "beta"]);
    const old = headSha(repo);
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
