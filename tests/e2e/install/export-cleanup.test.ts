/**
 * A scratch export crew refuses, and then can't remove (§9 step 3, §13;
 * C-INST-05i):
 * the refusal stays the error the user sees, with its own code, and names
 * the folder left behind rather than being replaced by the removal's own
 * failure.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew } from "./folder-links/helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(claude.originals);
  resetGitRunner();
});

test("C-INST-05i an export refused for a linked subpath, that crew can't remove, keeps its error and names it", () => {
  const repo = makeTempDir("crew-repo-");
  makeSkill(join(repo, "pkg"), "skill", skillFrontmatter({ name: "skill" }));
  // At v1 the subpath `link` is a link; at HEAD it is a real folder, so
  // only the export of v1 refuses it.
  symlinkSync("pkg", join(repo, "link"));
  makeGitRepo(repo);
  tagRepo(repo, "v1");
  rmSync(join(repo, "link"));
  mkdirSync(join(repo, "link"));
  makeSkill(join(repo, "link"), "other", skillFrontmatter({ name: "other" }));
  commitAll(repo, "link is a folder");

  let exported = "";
  const served = setGitRunner((args, options) => {
    const result = served(args, options);
    // Once the export is checked out, crew can read it but not remove it.
    const workTree = args.find((a) => a.startsWith("--work-tree="));
    if (workTree) {
      exported = workTree.slice("--work-tree=".length);
      chmodSync(exported, 0o555);
    }
    return result;
  });
  let r: ReturnType<typeof crew>;
  try {
    r = crew(makeCrewHome(), ["install", `file://${repo}//link@v1`]);
  } finally {
    if (exported) chmodSync(exported, 0o755);
  }
  expect([r.code, r.out.includes("(invalid_skill)")]).toEqual([4, true]);
  expect(r.out).toContain("`link` resolves through a symlink");
  expect(r.out).toContain(`left in place: \`${exported}\` (crew couldn't remove it`);
});
