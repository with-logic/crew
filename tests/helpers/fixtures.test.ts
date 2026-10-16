/**
 * `makeGitRepo` commits exactly the files it was given, whatever the
 * developer's own git configuration says.
 *
 * The failure this guards against only shows on a machine with a global
 * excludes file — CI has none — so the test builds one: a global config
 * whose excludes list `prd.md`, which a real developer setup had (a
 * `PRD.md` line, matching case-insensitively).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "../../src/git/exec.ts";
import { makeGitRepo, makeTempDir } from "./fixtures.ts";

const saved = process.env["GIT_CONFIG_GLOBAL"];

afterEach(() => {
  if (saved === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
  else process.env["GIT_CONFIG_GLOBAL"] = saved;
});

describe("makeGitRepo", () => {
  test("ignores the user's global excludes file", () => {
    const home = makeTempDir("crew-gitconfig-");
    writeFileSync(join(home, "ignore"), "prd.md\n");
    writeFileSync(join(home, "gitconfig"), `[core]\n\texcludesFile = ${join(home, "ignore")}\n`);
    process.env["GIT_CONFIG_GLOBAL"] = join(home, "gitconfig");

    const repo = makeTempDir("crew-repo-");
    writeFileSync(join(repo, "prd.md"), "a skill\n");
    makeGitRepo(repo);
    expect(runGit(["ls-files"], { cwd: repo }).stdout.trim()).toBe("prd.md");
  });
});
