/**
 * Shared fixtures for the `crew tap` suites: a two-skill tap repo and a
 * monorepo with skills under `skills/` plus a decoy at the root.
 */

import { join } from "node:path";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

export function buildTapRepo(): string {
  const repo = makeTempDir("crew-tap-repo-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "An alpha skill" }));
  makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "A beta skill" }));
  commitAll(repo, "init");
  return repo;
}

// C-TAP-12/13/14: subpath taps.
//
// A subpath tap points at a directory inside a repo (e.g. `skills/`) instead of
// the repo root. Once configured, users reference its skills the same way they
// would for a root tap — bare name, or `<tap>/<skill>` when disambiguating.
export function buildSubpathRepo(): string {
  const repo = makeTempDir("crew-monorepo-");
  makeGitRepo(repo);
  // Stuff at the root that is NOT a skill — would be wrongly indexed by a
  // root tap but must be ignored by a subpath tap.
  makeSkill(
    join(repo, "skills"),
    "gamma",
    skillFrontmatter({ name: "gamma", description: "A gamma skill under skills/" }),
  );
  makeSkill(
    join(repo, "skills"),
    "delta",
    skillFrontmatter({ name: "delta", description: "A delta skill under skills/" }),
  );
  // Noise outside the subpath — docs dir that happens to look skill-ish.
  makeSkill(
    repo,
    "decoy",
    skillFrontmatter({ name: "decoy", description: "Not reachable via subpath tap" }),
  );
  commitAll(repo, "init");
  return repo;
}
