/**
 * Shared fixtures for the `--verbose` suites (§5.2).
 *
 * Both suites need the same thing: Claude Code redirected at a temp
 * root so an install has somewhere inert to land, and a local `file://`
 * repo to install from.
 */

import { afterEach, beforeEach } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

let restore: (() => void) | null = null;

/** Redirect Claude Code at a fresh temp root for each test. */
export function redirectClaudeCode(): void {
  beforeEach(() => {
    const ccRoot = makeTempDir("crew-cc-");
    const original = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
    restore = () => {
      (claudeCodeAdapter as { userPath: () => string }).userPath = original.u;
      (claudeCodeAdapter as { detect: () => boolean }).detect = original.d;
    };
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });
}

/**
 * A local git repo holding one skill, named `demo` unless given another.
 *
 * The name matters when two runs share a redirected adapter root: two
 * skills called `demo` land on the same destination, and the second run
 * reports it already installed rather than doing the work.
 */
export function makeRepo(name: string = "demo"): string {
  const repo = makeTempDir("crew-repo-");
  makeSkill(repo, name, skillFrontmatter({ name }));
  makeGitRepo(repo);
  return repo;
}

/** Point a configured tap at an unreachable remote carrying `url`. */
export function tapWithUrl(home: string, url: string): void {
  writeConfig(
    {
      ...readConfig(home),
      taps: [{ name: "creds", kind: "git", registered: true, url, subpath: "", path: "" }],
    },
    home,
  );
}
