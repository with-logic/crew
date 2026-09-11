/**
 * Shared fixtures for the `crew tap … --dry-run` suites (§16.3, C-TAP-16b).
 *
 * Each suite asserts the preview ran the same validation as the real
 * command and that nothing on disk changed, so these helpers exist to
 * snapshot the things a regression would disturb: config bytes, clone
 * directories, and installed-skill markers.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

export function buildTapRepo(prefix: string): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "An alpha skill" }));
  commitAll(repo, "init");
  return repo;
}

/** Raw config.yaml, or "" when nothing has been written yet (fresh home). */
export function configBytes(home: string): string {
  const file = paths(home).configFile;
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/**
 * Raw marker bytes for an installed skill. Dry-run's contract covers
 * installed-skill markers, so previews must leave these byte-identical.
 */
export function markerBytes(installDir: string): string {
  return readFileSync(join(installDir, ".crew.json"), "utf8");
}

export function run(home: string, argv: string[]) {
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, stdout: c.stdout(), stderr: c.stderr() };
}
