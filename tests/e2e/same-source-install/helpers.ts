/**
 * Shared fixtures for the canonical-source-identity suites (§5.4, §16.5).
 *
 * Every suite in this directory needs the same two things: a git repo
 * whose skills live under `skills/`, and an install that targets exactly
 * one redirected adapter so results don't depend on which agents happen
 * to be installed on the host.
 */

import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Adapter redirection shared by every suite here. */
export interface AdapterRedirect {
  root: string;
  restore: () => void;
}

/**
 * Point Claude Code at a temp root and mark it detected. Returns the
 * root plus the restore function each suite calls in `afterEach`.
 */
export function redirectClaudeCode(): AdapterRedirect {
  const root = makeTempDir("crew-cc-");
  const user = claudeCodeAdapter.userPath;
  const detect = claudeCodeAdapter.detect;
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => root;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  return {
    root,
    restore: () => {
      (claudeCodeAdapter as { userPath: () => string }).userPath = user;
      (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
    },
  };
}

/** A repo whose skills live under `skills/`. */
export function buildRepo(names: readonly string[]): string {
  const repo = makeTempDir("crew-samesrc-");
  makeGitRepo(repo);
  for (const n of names) {
    makeSkill(join(repo, "skills"), n, skillFrontmatter({ name: n, description: `${n} skill` }));
  }
  commitAll(repo, "initial");
  return repo;
}

/**
 * Install with a fresh capture, returning the exit code and stdout.
 * Restricted to the one redirected adapter so the expected agent set is
 * not a function of the host.
 */
export function install(home: string, ref: string): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(["install", ref, "--agent", "claude-code"], { home, streams: cap.streams });
  return { code, out: cap.stdout() };
}
