/**
 * Shared fixture for the install-from-tap suites: a two-skill tap repo.
 */

import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Build a repo that will be added as a tap (two skills: alpha, beta). */
export function buildTapRepo(): string {
  const repo = makeTempDir("crew-tap-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha" }));
  makeSkill(repo, "beta", skillFrontmatter({ name: "beta" }));
  commitAll(repo, "init");
  return repo;
}
