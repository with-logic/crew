/**
 * Shared fixtures for the one-clone-per-repository suites (§6, §16.3).
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** A repo with two skills in separate subdirectories. */
export function twoSubpathRepo(): string {
  const repo = makeTempDir("crew-shared-clone-");
  makeGitRepo(repo);
  for (const name of ["alpha", "beta"]) {
    const dir = join(repo, name);
    mkdirSync(dir);
    makeSkill(dir, name, skillFrontmatter({ name, description: `The ${name} skill` }));
  }
  commitAll(repo, "init");
  return repo;
}

export function run(home: string, args: string[]): { code: number; stdout: string } {
  const c = captureStreams();
  const code = runCli(args, { home, streams: c.streams });
  return { code, stdout: c.stdout() };
}

/**
 * A home with no `core` tap, so `cloneDirs` counts only the repository
 * under test rather than also picking up the default tap's clone.
 */
export function bareHome(): string {
  const home = makeCrewHome();
  run(home, ["tap", "remove", "core", "--force"]);
  return home;
}
