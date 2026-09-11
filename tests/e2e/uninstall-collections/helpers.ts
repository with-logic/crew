/**
 * Shared fixtures for the `crew uninstall` collection-selector suites
 * (§5.3.1, §7.4).
 *
 * `installAdapters` redirects Claude Code at a temp root for the length of
 * each test; every install here names its agents explicitly so a test's
 * expectations never depend on which adapters the host happens to have.
 */

import { afterEach, beforeEach } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

let ccUser: string;
let originals: { user: () => string; project: (c: string) => string; detect: () => boolean };

/** Point Claude Code at a fresh temp root for each test in the file. */
export function useClaudeCodeAdapter(): void {
  beforeEach(() => {
    ccUser = makeTempDir("crew-cc-");
    originals = {
      user: claudeCodeAdapter.userPath,
      project: claudeCodeAdapter.projectPath,
      detect: claudeCodeAdapter.detect,
    };
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
    (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
      join(c, ".claude", "skills");
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  });
  afterEach(() => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
    (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
  });
}

export const quiet = () => captureStreams().streams;

/** A git tap whose `skills/` root holds the given namespace → skills layout. */
export function buildTap(prefix: string, layout: Record<string, readonly string[]>): string {
  const repo = makeTempDir(prefix);
  const skillsDir = join(repo, "skills");
  mkdirSync(skillsDir);
  for (const [ns, skills] of Object.entries(layout)) {
    if (ns === ".") {
      for (const name of skills) makeSkill(skillsDir, name, skillFrontmatter({ name }));
      continue;
    }
    const nsDir = join(skillsDir, ns);
    mkdirSync(nsDir);
    for (const name of skills) makeSkill(nsDir, name, skillFrontmatter({ name }));
  }
  makeGitRepo(repo);
  return `file://${repo}`;
}

/** Register a tap; returns the exit code so callers can assert on it. */
export function addTap(home: string, url: string, name: string): number {
  return runCli(["tap", "add", url, name], { home, streams: quiet() });
}

/**
 * Install a selector into Claude Code only. Naming the agent keeps the
 * expected agent list independent of what is detected on this machine.
 *
 * `cwd` defaults to the process cwd, which is what a user-scope install
 * sees anyway; project-scope installs pass their project root.
 */
export function install(
  home: string,
  args: readonly string[],
  cwd: string = process.cwd(),
): number {
  return runCli(["install", ...args, "--agent", "claude-code"], { home, cwd, streams: quiet() });
}

export function installed(home: string): string[] {
  return readState(home)
    .installations.map((e) => e.name)
    .sort();
}
