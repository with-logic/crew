/**
 * Bare `crew install` as a project setup step (§9.2): it must be safe to
 * run on every machine, every time — with no agents, with nothing to do,
 * and with a source that cannot be reached.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, installed, makeProject, makeSkillRepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode> | null = null;
const detect = claudeCodeAdapter.detect;
afterEach(() => {
  if (redirected) restoreClaudeCode(redirected.originals);
  redirected = null;
  (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
});

/** Make this a machine with no agent coder on it, as a CI runner is. */
function noAgentsDetected(): void {
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => false;
}

/** A `file://` reference to a repository that does not exist. */
const unreachable = (): string => `file://${join(makeTempDir("crew-gone-"), "no-such-repo")}`;

describe("bare crew install as a setup step", () => {
  test("C-RC-34 with no active agent it exits 0 without acquiring any source or writing anything", () => {
    noAgentsDetected();
    const home = makeCrewHome();
    const project = makeProject([unreachable()]);

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      already_installed: [],
      records: [],
      skipped: [],
      dry_run: false,
      manifest_path: join(project, ".crewrc"),
      no_agents: true,
    });
    expect(existsSync(join(home, "state.json"))).toBe(false);
    expect(existsSync(join(project, ".claude"))).toBe(false);
    expect(crew(home, project, ["install"]).stdout).toContain("No active agent coders");
  });

  test("C-RC-34 an agent that is force-enabled but not detected counts as active", () => {
    redirected = redirectClaudeCode();
    noAgentsDetected();
    const home = makeCrewHome();
    expect(crew(home, home, ["agents", "enable", "claude-code"]).code).toBe(0);
    const project = makeProject([makeSkillRepo(["alpha"])]);

    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(installed(home)).toEqual([`alpha@${project}`]);
  });

  test("C-RC-35 naming an agent that is not active is still no_agents", () => {
    noAgentsDetected();
    const run = crew(makeCrewHome(), makeProject([unreachable()]), [
      "install",
      "--agent",
      "claude-code",
    ]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("no_agents");
  });

  test("C-RC-36 when everything declared is installed, it contacts no remote and exits 0", () => {
    redirected = redirectClaudeCode();
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const project = makeProject([repo]);
    expect(crew(home, project, ["install"]).code).toBe(0);
    // Take the remote away: any attempt to contact it now fails. The local
    // clone crew made on the first install is still in place.
    const repoDir = repo.slice("file://".length);
    renameSync(repoDir, `${repoDir}-moved`);
    try {
      const run = crew(home, project, ["install"]);

      expect(run.code).toBe(0);
      expect(installed(home)).toEqual([`alpha@${project}`]);
    } finally {
      renameSync(`${repoDir}-moved`, repoDir);
    }
  });

  test("C-RC-37 one unreachable source fails the whole install and installs nothing", () => {
    redirected = redirectClaudeCode();
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"]), unreachable()]);

    const run = crew(home, project, ["install"]);

    expect(run.code).toBe(5);
    expect(run.stderr).toContain("source_unreachable");
    expect(installed(home)).toEqual([]);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });
});
