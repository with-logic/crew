/**
 * Shared fixtures for the `crew tap remove` guard suites (§16.3).
 *
 * Every suite redirects Claude Code at a temp root so installs never
 * touch a real agent directory, and builds taps from local `file://`
 * repos so no test contacts the network.
 */

import { afterEach, beforeEach } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
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

let ccRoot: string;
let restore: (() => void) | null = null;

/**
 * Redirect Claude Code at a temp root for the calling suite. Project
 * scope is redirected too, so a suite can install the same skill at two
 * §11.1 locations without touching a real agent directory.
 */
export function useTempAgentRoot(): void {
  beforeEach(() => {
    ccRoot = makeTempDir("crew-cc-");
    const originals = {
      u: claudeCodeAdapter.userPath,
      d: claudeCodeAdapter.detect,
      p: claudeCodeAdapter.projectPath,
    };
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
    (claudeCodeAdapter as { projectPath: (cwd: string) => string }).projectPath = (cwd) =>
      join(cwd, ".claude", "skills");
    restore = () => {
      (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
      (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
      (claudeCodeAdapter as { projectPath: (cwd: string) => string }).projectPath = originals.p;
    };
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });
}

/** The temp directory Claude Code installs into for the current test. */
export function agentRoot(): string {
  return ccRoot;
}

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
