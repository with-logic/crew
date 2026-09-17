/**
 * Fixture shared by the namespace suites: a git tap with a `skills/<ns>/`
 * layout (§8.3).
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Build a tap repo with a namespaced layout. */
export function buildNamespacedTap(
  prefix: string,
  layout: Record<string, readonly string[]>,
): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  const skillsDir = join(repo, "skills");
  mkdirSync(skillsDir);
  for (const [ns, skills] of Object.entries(layout)) {
    const nsDir = join(skillsDir, ns);
    mkdirSync(nsDir);
    for (const name of skills) {
      makeSkill(nsDir, name, skillFrontmatter({ name }));
    }
  }
  commitAll(repo, "initial");
  return repo;
}
