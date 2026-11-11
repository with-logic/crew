/**
 * Several manifests in one run (§9.2): how one project's outcome affects
 * the others, and what `--save` and a dropped line do.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { setGitRunner } from "../../../../src/git/exec.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir } from "../../../helpers/fixtures.ts";
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

/** Count the `git ls-remote` calls made until `stop` is called. */
function countingLookups(): { count: () => number; stop: () => void } {
  let made = 0;
  const real = setGitRunner((args, options) => {
    if (args[0] === "ls-remote") made += 1;
    return real(args, options);
  });
  return { count: () => made, stop: () => setGitRunner(real) };
}

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

  test("C-RC-60 when two projects exit non-zero, the first one's code is the command's", () => {
    const home = makeCrewHome();
    const beta = makeSkillRepo(["beta"]);
    const root = makeMonorepo({ "packages/a": ["./broken"], "packages/b": [beta] });
    const a = join(root, "packages/a");
    const b = join(root, "packages/b");
    makeSkill(a, "broken", "name: broken");
    // In b, a dropped skill that cannot be removed makes that project exit 1.
    expect(crew(home, b, ["install"]).code).toBe(0);
    rmSync(join(skillDir(b, "beta"), ".crew.json"));
    writeManifest(b, []);
    expect(crew(home, a, ["install"]).code).toBe(4);
    expect(crew(home, b, ["install"]).code).toBe(1);

    expect(crew(home, root, ["install"]).code).toBe(4);
  });

  test("C-RC-61 --latest moves every project, asking a source they share once", () => {
    const home = makeCrewHome();
    const shared = makeSkillRepo(["alpha"]);
    const root = makeMonorepo({ ".": [shared], "packages/api": [shared] });
    const api = join(root, "packages/api");
    expect(crew(home, root, ["install"]).code).toBe(0);
    // Both projects are now locked to the first commit; the source moves on.
    const repoDir = shared.slice("file://".length);
    writeFileSync(join(repoDir, "alpha", "notes.md"), "v2\n");
    const second = commitAll(repoDir, "publish v2");
    const lookups = countingLookups();
    try {
      expect(crew(home, root, ["install", "--latest"]).code).toBe(0);
      expect(lookups.count()).toBe(1);
      // The sharing lasts one command: the next run asks again.
      expect(crew(home, root, ["install", "--latest"]).code).toBe(0);
      expect(lookups.count()).toBe(2);
    } finally {
      lookups.stop();
    }
    for (const project of [root, api]) {
      expect(readFileSync(join(skillDir(project, "alpha"), "notes.md"), "utf8")).toBe("v2\n");
      expect(readFileSync(join(project, ".crewrc.lock"), "utf8")).toContain(second);
    }
  });

  test("C-RC-61 --latest also asks once about a ref the remote does not list", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const repoDir = repo.slice("file://".length);
    const line = `${repo}@${commitAll(repoDir, "second").slice(0, 12)}`;
    const root = makeMonorepo({ ".": [line], "packages/api": [line] });
    expect(crew(home, root, ["install"]).code).toBe(0);
    const lookups = countingLookups();
    try {
      expect(crew(home, root, ["install", "--latest"]).code).toBe(0);
    } finally {
      lookups.stop();
    }

    expect(lookups.count()).toBe(1);
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
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, "packages/api", ".claude"))).toBe(false);
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
