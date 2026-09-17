/**
 * Shared fixture for the tap/bundle unification suites (§16.4, §16.5):
 * a multi-skill tap repo builder.
 */

import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Build a multi-skill git repo that will be added as a tap. */
export function buildTapRepo(prefix: string, names: readonly string[]): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const n of names) {
    makeSkill(repo, n, skillFrontmatter({ name: n, description: `${n} skill` }));
  }
  commitAll(repo, "initial");
  return repo;
}
