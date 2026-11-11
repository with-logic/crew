/**
 * Fixtures shared by the `--save` e2e tests (§9.2).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crew, makeProject, makeSkillRepo } from "../helpers.ts";

/** The text of the project's `.crewrc`. */
export function manifestOf(project: string): string {
  return readFileSync(join(project, ".crewrc"), "utf8");
}

/** A project with `alpha` and `beta` installed from two repositories. */
export function projectWithTwoSkills(home: string): {
  project: string;
  alpha: string;
  beta: string;
} {
  const alpha = makeSkillRepo(["alpha"]);
  const beta = makeSkillRepo(["beta"]);
  const project = makeProject(["# shared skills", alpha, beta]);
  if (crew(home, project, ["install"]).code !== 0) throw new Error("setup install failed");
  return { project, alpha, beta };
}
