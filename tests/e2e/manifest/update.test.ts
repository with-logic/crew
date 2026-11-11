/**
 * `crew update` and manifest-owned skills (§9.2, §10.1): an update never
 * moves a skill a project manifest owns, and never adds siblings to it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** Commit a changed `alpha` and a brand-new `beta` to the repository behind `repo`. */
function publishV2(repo: string): void {
  const dir = repo.slice("file://".length);
  writeFileSync(join(dir, "alpha", "notes.md"), "v2\n");
  makeSkill(dir, "beta", skillFrontmatter({ name: "beta" }));
  commitAll(dir, "v2 changes alpha, adds beta");
}

interface Row {
  name: string;
  outcome: { kind: string; reason?: string };
}

describe("crew update and manifest-owned skills", () => {
  test("C-RC-18 update skips an owned skill, forced or not, and adds no sibling to it", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const before = readState(home);
    publishV2(repo);

    for (const args of [
      ["update", "--json"],
      ["update", "--force", "--json"],
    ]) {
      const run = crew(home, project, args);
      expect(run.code).toBe(0);
      const { rows } = JSON.parse(run.stdout) as { rows: Row[] };
      expect(rows.map((row) => [row.name, row.outcome.kind, row.outcome.reason])).toEqual([
        ["alpha", "skipped", "managed by .crewrc"],
      ]);
    }

    expect(readState(home)).toEqual(before);
    expect(existsSync(join(project, ".claude", "skills", "alpha", "notes.md"))).toBe(false);
    expect(existsSync(join(project, ".claude", "skills", "beta"))).toBe(false);
  });

  test("C-RC-18 update still succeeds when an owned skill's source cannot be reached", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    const dir = repo.slice("file://".length);
    renameSync(dir, `${dir}-moved`);

    expect(crew(home, project, ["update"]).code).toBe(0);
  });

  test("C-RC-19 the same source installed by hand elsewhere still updates and gains siblings", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    const other = makeProject([]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(crew(home, other, ["install", "--scope", "project", repo]).code).toBe(0);
    publishV2(repo);

    expect(crew(home, project, ["update"]).code).toBe(0);

    expect(existsSync(join(other, ".claude", "skills", "alpha", "notes.md"))).toBe(true);
    expect(existsSync(join(other, ".claude", "skills", "beta", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, ".claude", "skills", "alpha", "notes.md"))).toBe(false);
    expect(existsSync(join(project, ".claude", "skills", "beta"))).toBe(false);
    const elsewhere = readState(home).installations.filter((e) => e.project_root === other);
    expect(elsewhere.map((e) => [e.name, e.manifest_owned]).sort()).toEqual([
      ["alpha", undefined],
      ["beta", undefined],
    ]);
  });

  test("C-RC-18 a group with one owned member gains no sibling, even for its hand-installed member", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha", "gamma"]);
    const project = makeProject([`${repo}//alpha`]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(crew(home, project, ["install", "--scope", "project", repo]).code).toBe(0);
    publishV2(repo);

    expect(crew(home, project, ["update"]).code).toBe(0);

    expect(existsSync(join(project, ".claude", "skills", "gamma", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, ".claude", "skills", "beta"))).toBe(false);
  });
});
