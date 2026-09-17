/**
 * Fixture shared by the multi-skill install suites: a git repo with N
 * top-level skills and no root SKILL.md (§9 step 5).
 */

import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Build a repo with N top-level skills, no root SKILL.md → multi-skill install. */
export function makeMultiSkillRepo(names: readonly string[]): string {
  const repo = makeTempDir();
  makeGitRepo(repo);
  for (const n of names) {
    makeSkill(repo, n, skillFrontmatter({ name: n }));
  }
  commitAll(repo, "initial");
  return repo;
}
