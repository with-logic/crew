/**
 * Shared fixtures for the lockfile e2e tests (§9.3).
 */

import { join } from "node:path";
import { runGit } from "../../../../src/git/exec.ts";

/** The lockfile path for `project`. */
export function lockFile(project: string): string {
  return join(project, ".crewrc.lock");
}

/** The directory behind a `file://` repository reference. */
export function dirOf(repo: string): string {
  return repo.slice("file://".length);
}

/** The commit currently checked out in `repo`. */
export function headOf(repo: string): string {
  return runGit(["rev-parse", "HEAD"], { cwd: dirOf(repo) }).stdout.trim();
}
