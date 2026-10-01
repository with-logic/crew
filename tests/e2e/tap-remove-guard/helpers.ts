/**
 * Shared fixtures for the `crew tap remove` guard suites (§16.3).
 *
 * Every suite redirects Claude Code at a temp root so installs never
 * touch a real agent directory, and builds taps from local `file://`
 * repos so no test contacts the network.
 */

import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

export { makeCrewHome, makeTempDir };

/** Run the CLI against `home`, capturing both streams. */
export function run(home: string, argv: string[]) {
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, stdout: c.stdout(), stderr: c.stderr() };
}

/** Run the CLI against `home` from a specific `cwd` (for project scope). */
export function runIn(home: string, argv: string[], cwd: string) {
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams, cwd });
  return { code, stdout: c.stdout(), stderr: c.stderr() };
}

/** A one-skill git repo usable as a tap. */
export function buildTapRepo(name: string = "alpha"): string {
  const repo = makeTempDir("crew-guard-repo-");
  makeGitRepo(repo);
  makeSkill(repo, name, skillFrontmatter({ name, description: `The ${name} skill` }));
  commitAll(repo, "init");
  return repo;
}

/**
 * Add the repo as a tap and install everything in it. Returns the summed
 * exit codes so the caller owns the assertions (Biome forbids them here).
 */
export function tapWithInstall(home: string, repo: string, tap: string = "mytap"): number {
  const added = run(home, ["tap", "add", `file://${repo}`, tap]).code;
  const installed = run(home, ["install", tap, "--agent", "claude-code"]).code;
  return added + installed;
}
