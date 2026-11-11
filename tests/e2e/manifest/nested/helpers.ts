/**
 * Fixtures for bare installs in a repository with several projects (§9.2).
 */

import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { makeGitRepo, makeTempDir } from "../../../helpers/fixtures.ts";
import { writeManifest } from "../helpers.ts";

/**
 * A git repository holding one project per entry of `manifests`: a
 * directory relative to the repository root (`.` for the root itself)
 * mapped to the lines of its `.crewrc`. Returns the root as a physical path.
 */
export function makeMonorepo(manifests: Record<string, readonly string[]>): string {
  const root = realpathSync(makeTempDir("crew-mono-"));
  makeGitRepo(root);
  for (const [dir, lines] of Object.entries(manifests)) {
    mkdirSync(join(root, dir), { recursive: true });
    writeManifest(join(root, dir), lines);
  }
  return root;
}
