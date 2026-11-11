/**
 * `crew install --latest` (§9.3): unpinned manifest lines move to the
 * commit their remote names now, and the lockfile records it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCK_HEADER } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, tagRepo } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import {
  addLocalSkill,
  crew,
  makeProject,
  makeSkillRepo,
  skillDir,
  writeManifest,
} from "../helpers.ts";
import { dirOf, headSha, lockFile } from "../lockfile/helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** Commit a new `notes.md` for `skill` in `repo`; returns the new commit. */
function publish(repo: string, skill: string, text: string): string {
  writeFileSync(join(dirOf(repo), skill, "notes.md"), text);
  return commitAll(dirOf(repo), `publish ${text.trim()}`);
}

function notes(project: string, skill: string): string | null {
  const file = join(skillDir(project, skill), "notes.md");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

describe("crew install --latest", () => {
  test("C-RC-47 a locked line stays put on a plain install and moves with --latest", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const second = publish(repo, "alpha", "v2\n");

    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(notes(project, "alpha")).toBeNull();

    expect(crew(home, project, ["install", "--latest"]).code).toBe(0);
    expect(notes(project, "alpha")).toBe("v2\n");
    expect(readFileSync(lockFile(project), "utf8")).toBe(`${LOCK_HEADER}\n${second} ${repo}\n`);
  });

  test("C-RC-47 a second checkout given the new lockfile installs the same commit", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    publish(repo, "alpha", "v2\n");
    expect(crew(home, project, ["install", "--latest"]).code).toBe(0);
    const lock = readFileSync(lockFile(project), "utf8");
    publish(repo, "alpha", "v3\n");

    const elsewhere = makeProject([repo]);
    writeFileSync(lockFile(elsewhere), lock);
    expect(crew(makeCrewHome(), elsewhere, ["install"]).code).toBe(0);

    expect(notes(elsewhere, "alpha")).toBe("v2\n");
  });

  test("C-RC-47 a branch line moves along its branch, and a tag line to where the tag now points", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    tagRepo(dirOf(repo), "stable");
    const project = makeProject([`${repo}@main`]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const second = publish(repo, "alpha", "v2\n");

    expect(crew(home, project, ["install", "--latest"]).code).toBe(0);
    expect(readFileSync(lockFile(project), "utf8")).toBe(
      `${LOCK_HEADER}\n${second} ${repo}@main\n`,
    );

    // The tag still names the first commit, so that line goes back to it.
    writeManifest(project, [`${repo}@stable`]);
    expect(crew(home, project, ["install", "--latest"]).code).toBe(0);
    expect(notes(project, "alpha")).toBeNull();
  });

  test("C-RC-48 a line pinned to a full commit and a path line are left alone", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const first = headSha(repo);
    const project = makeProject([`${repo}@${first}`, "./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    expect(crew(home, project, ["install"]).code).toBe(0);
    publish(repo, "alpha", "v2\n");

    expect(crew(home, project, ["install", "--latest"]).code).toBe(0);

    expect(notes(project, "alpha")).toBeNull();
    expect(existsSync(lockFile(project))).toBe(false);
  });

  test("C-RC-48 a line naming an abbreviated commit keeps the commit it is locked to", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const first = headSha(repo);
    const line = `${repo}@${first.slice(0, 12)}`;
    const project = makeProject([line]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    publish(repo, "alpha", "v2\n");

    expect(crew(home, project, ["install", "--latest"]).code).toBe(0);

    expect(notes(project, "alpha")).toBeNull();
    expect(readFileSync(lockFile(project), "utf8")).toBe(`${LOCK_HEADER}\n${first} ${line}\n`);
  });

  test("C-RC-48 with nothing newer, --latest changes nothing and rewrites nothing", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const lock = readFileSync(lockFile(project), "utf8");
    const state = readFileSync(join(home, "state.json"), "utf8");

    const run = crew(home, project, ["install", "--latest", "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { records: unknown[] }).records).toEqual([]);
    expect(readFileSync(lockFile(project), "utf8")).toBe(lock);
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(state);
  });
});
