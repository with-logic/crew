/**
 * Several manifests in one run (§9.2): how one project's outcome affects
 * the others, and what `--save` and a dropped line do.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, installed, makeSkillRepo, skillDir, writeManifest } from "../helpers.ts";
import { makeMonorepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("several manifests, one run", () => {
  test("C-RC-60 a project that exits non-zero sets the exit code, and the others are still installed", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": ["./broken"],
      "packages/web": [makeSkillRepo(["gamma"])],
    });
    makeSkill(join(root, "packages/api"), "broken", "name: broken");

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(4);
    expect(installed(home)).toEqual([`alpha@${root}`, `gamma@${join(root, "packages/web")}`]);
  });

  test("C-RC-60 a project that raises an error stops the run there; earlier projects stay installed", () => {
    const home = makeCrewHome();
    const missing = `file://${join(makeTempDir("crew-repo-"), "missing")}`;
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [missing],
      "packages/web": [makeSkillRepo(["gamma"])],
    });

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(5);
    expect(run.stderr).toContain("source_unreachable");
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });

  test("C-RC-60 with no active agent every project reports it and nothing is installed", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    const detect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => false;
    try {
      const run = crew(home, root, ["install", "--json"]);
      expect(run.code).toBe(0);
      const result = JSON.parse(run.stdout) as {
        no_agents: boolean;
        nested: { no_agents: boolean }[];
      };
      expect(result.no_agents).toBe(true);
      expect(result.nested.map((project) => project.no_agents)).toEqual([true]);
    } finally {
      (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
    }
    expect(existsSync(join(home, "state.json"))).toBe(false);
  });

  test("C-RC-61 a line dropped from a nested manifest removes that project's skill only", () => {
    const home = makeCrewHome();
    const shared = makeSkillRepo(["alpha"]);
    const root = makeMonorepo({ ".": [shared], "packages/api": [shared] });
    const api = join(root, "packages/api");
    expect(crew(home, root, ["install"]).code).toBe(0);
    expect(installed(home)).toEqual([`alpha@${root}`, `alpha@${api}`]);

    writeManifest(api, []);
    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { nested: { removed: { name: string }[] }[] };
    expect(result.nested[0]?.removed.map((record) => record.name)).toEqual(["alpha"]);
    expect(installed(home)).toEqual([`alpha@${root}`]);
    expect(existsSync(skillDir(api, "alpha"))).toBe(false);
  });

  test("C-RC-61 --save edits and installs the governing project only", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({ ".": [], "packages/api": [makeSkillRepo(["beta"])] });

    const run = crew(home, root, ["install", "--save", makeSkillRepo(["alpha"]), "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { nested?: unknown }).nested).toBeUndefined();
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });
});
