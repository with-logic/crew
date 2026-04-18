/**
 * Thin, testable wrapper around the `git` CLI.
 *
 * We shell out to `git` because §17.1 makes it a required external
 * dependency. This module exposes a single entry point, `runGit`, plus a
 * test seam (`setGitRunner`) that tests can use to swap out the underlying
 * executor without stubbing `Bun.spawn`.
 *
 * Every caller in the codebase goes through `runGit`, so there is exactly
 * one place that touches the subprocess boundary.
 */

/** Result of running a git command. */
export interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Signature of a git runner. */
export type GitRunner = (args: readonly string[], options: GitRunOptions) => GitResult;

/** Options accepted by `runGit`. */
export interface GitRunOptions {
  /** Working directory for the git process. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Environment variables to add to the subprocess. */
  readonly env?: Readonly<Record<string, string>>;
  /** If true (default), throw on non-zero exit. If false, return the `GitResult` either way. */
  readonly throwOnError?: boolean;
}

let runner: GitRunner = defaultRunner;

/** Run `git` with the given args. */
export function runGit(args: readonly string[], options: GitRunOptions = {}): GitResult {
  const result = runner(args, options);
  if (result.exitCode !== 0 && options.throwOnError !== false) {
    const stderr = result.stderr.trim();
    throw new GitProcessError(`git ${args.join(" ")} failed (${result.exitCode}): ${stderr}`, result);
  }
  return result;
}

/** Error raised when `git` exits non-zero. Not a `CrewError` — callers map. */
export class GitProcessError extends Error {
  readonly result: GitResult;
  constructor(message: string, result: GitResult) {
    super(message);
    this.name = "GitProcessError";
    this.result = result;
  }
}

/** Install a test-only git runner. Returns the previous one. */
export function setGitRunner(next: GitRunner): GitRunner {
  const prev = runner;
  runner = next;
  return prev;
}

/** Reset the git runner to the default (real subprocess). */
export function resetGitRunner(): void {
  runner = defaultRunner;
}

/** The real runner: invokes `git` via `Bun.spawnSync`. */
function defaultRunner(args: readonly string[], options: GitRunOptions): GitResult {
  const proc = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: options.cwd ?? process.cwd(),
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout?.toString() ?? "",
    stderr: proc.stderr?.toString() ?? "",
    exitCode: proc.exitCode ?? -1,
  };
}
