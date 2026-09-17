/**
 * Shared fixtures for the `crew tap update` suites: read a clone's HEAD
 * and build a tap repo from a skill list.
 */

import { runGit } from "../../../src/git/exec.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Read the current detached HEAD SHA of a clone. */
export function headSha(clonePath: string): string {
  return runGit(["rev-parse", "HEAD"], { cwd: clonePath }).stdout.trim();
}

export function buildTap(
  prefix: string,
  skills: readonly { name: string; desc: string }[],
): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const s of skills) {
    makeSkill(repo, s.name, skillFrontmatter({ name: s.name, description: s.desc }));
  }
  commitAll(repo, "init");
  return repo;
}
