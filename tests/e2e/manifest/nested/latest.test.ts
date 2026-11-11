/**
 * `crew install --latest` over several manifests (§9.2, §9.3): every
 * project moves, and a source they share is asked about once.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setGitRunner } from "../../../../src/git/exec.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, tagRepo } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeSkillRepo, skillDir } from "../helpers.ts";
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

describe("--latest over several manifests", () => {
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

  test("C-RC-61 --latest asks once per ref, and once for two spellings of one repository", () => {
    const home = makeCrewHome();
    const repo = makeSkillRepo(["alpha"]);
    const repoDir = repo.slice("file://".length);
    tagRepo(repoDir, "v1");
    const root = makeMonorepo({
      ".": [`${repo}@main`],
      "packages/api": [`${repo}/@main`],
      "packages/web": [`${repo}@v1`],
    });
    expect(crew(home, root, ["install"]).code).toBe(0);
    writeFileSync(join(repoDir, "alpha", "notes.md"), "v2\n");
    const second = commitAll(repoDir, "publish v2");
    const lookups = countingLookups();
    try {
      expect(crew(home, root, ["install", "--latest"]).code).toBe(0);
    } finally {
      lookups.stop();
    }

    // `main` once for the two spellings, `v1` once.
    expect(lookups.count()).toBe(2);
    const web = join(root, "packages/web");
    expect(readFileSync(join(root, ".crewrc.lock"), "utf8")).toContain(second);
    expect(readFileSync(join(root, "packages/api", ".crewrc.lock"), "utf8")).toContain(second);
    expect(readFileSync(join(web, ".crewrc.lock"), "utf8")).not.toContain(second);
    expect(existsSync(join(skillDir(web, "alpha"), "notes.md"))).toBe(false);
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
});
