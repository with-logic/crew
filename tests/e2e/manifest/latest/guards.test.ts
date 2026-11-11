/**
 * `crew install --latest` (§9.3): where it does not apply, and what it
 * leaves untouched when it cannot finish.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, skillDir } from "../helpers.ts";
import { dirOf, lockFile } from "../lockfile/helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** A project installed from one repository that has since published a new commit. */
function projectBehindItsSource(home: string): { project: string; repo: string; lock: string } {
  const repo = makeSkillRepo(["alpha"]);
  const project = makeProject([repo]);
  if (crew(home, project, ["install"]).code !== 0) throw new Error("setup install failed");
  writeFileSync(join(dirOf(repo), "alpha", "notes.md"), "v2\n");
  commitAll(dirOf(repo), "publish v2");
  return { project, repo, lock: readFileSync(lockFile(project), "utf8") };
}

const hasNewNotes = (project: string): boolean =>
  existsSync(join(skillDir(project, "alpha"), "notes.md"));

describe("crew install --latest guards", () => {
  test("C-RC-49 with a reference on the command line it is a usage_error", () => {
    const home = makeCrewHome();
    const { project, repo } = projectBehindItsSource(home);

    for (const args of [
      ["install", "--latest", repo],
      ["install", "--latest", "--from-git", repo],
    ]) {
      const run = crew(home, project, args);
      expect(run.code).not.toBe(0);
      expect(run.stderr).toContain("usage_error");
      expect(run.stderr).toContain("--latest");
    }
    expect(hasNewNotes(project)).toBe(false);
  });

  test("C-RC-49 --dry-run shows the move and writes nothing", () => {
    const home = makeCrewHome();
    const { project, lock } = projectBehindItsSource(home);
    const state = readFileSync(join(home, "state.json"), "utf8");

    const run = crew(home, project, ["install", "--latest", "--dry-run", "--json"]);

    expect(run.code).toBe(0);
    const { records } = JSON.parse(run.stdout) as { records: { name: string }[] };
    expect(records.map((record) => record.name)).toEqual(["alpha"]);
    expect(hasNewNotes(project)).toBe(false);
    expect(readFileSync(lockFile(project), "utf8")).toBe(lock);
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(state);
  });

  test("C-RC-50 an unreachable source fails the run and leaves skills and lockfile as they were", () => {
    const home = makeCrewHome();
    const { project, repo, lock } = projectBehindItsSource(home);
    renameSync(dirOf(repo), `${dirOf(repo)}-gone`);

    const run = crew(home, project, ["install", "--latest"]);

    expect(run.code).toBe(5);
    expect(run.stderr).toContain("source_unreachable");
    expect(existsSync(join(skillDir(project, "alpha"), "SKILL.md"))).toBe(true);
    expect(readFileSync(lockFile(project), "utf8")).toBe(lock);
  });

  test("C-RC-50 with no active agent it exits 0 without contacting any source", () => {
    const home = makeCrewHome();
    const { project, repo, lock } = projectBehindItsSource(home);
    renameSync(dirOf(repo), `${dirOf(repo)}-gone`);
    const detect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => false;
    try {
      const run = crew(home, project, ["install", "--latest", "--json"]);
      expect(run.code).toBe(0);
      expect((JSON.parse(run.stdout) as { no_agents: boolean }).no_agents).toBe(true);
      // Naming an agent is a request for it, so that still fails as `no_agents`.
      expect(crew(home, project, ["install", "--latest", "--agent", "claude-code"]).code).not.toBe(
        0,
      );
    } finally {
      (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
    }
    expect(readFileSync(lockFile(project), "utf8")).toBe(lock);
  });
});
