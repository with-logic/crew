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

import { positiveEnvNumber } from "../util/env-number.ts";
import { progress } from "../util/progress.ts";
import { safeArgs, safePath } from "../util/redact.ts";

/** Result of running a git command. */
export interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** True when the command was stopped at its deadline (§17.1) instead of exiting. */
  readonly timedOut?: true;
}

/** Signature of a git runner. */
export type GitRunner = (args: readonly string[], options: GitRunOptions) => GitResult;

/** Options accepted by `runGit`. */
export interface GitRunOptions {
  /** Working directory for the git process. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Environment variables to add to the subprocess. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * If true (default), throw on non-zero exit. If false, return the
   * `GitResult` either way, except for a command stopped at its deadline,
   * which always throws: it is never the miss a caller is probing for.
   */
  readonly throwOnError?: boolean;
}

let runner: GitRunner = defaultRunner;

/** Run `git` with the given args. */
export function runGit(args: readonly string[], options: GitRunOptions = {}): GitResult {
  // Argv can carry a clone URL with credentials, so it never reaches
  // the sink unredacted (see `util/redact.ts`).
  const rendered = safeArgs(args);
  progress(options.cwd ? `$ git ${rendered}  (in ${safePath(options.cwd)})` : `$ git ${rendered}`);
  const result = runner(args, options);
  const shouldThrowForNonzeroExit = result.exitCode !== 0 && options.throwOnError !== false;
  if (result.timedOut || shouldThrowForNonzeroExit) {
    const stderr = result.stderr.trim();
    throw new GitProcessError(
      `git ${args.join(" ")} failed (${result.exitCode}): ${stderr}`,
      result,
    );
  }
  return result;
}

/**
 * Error raised when `git` exits non-zero, or is stopped at its deadline
 * (§17.1). Not a `CrewError` — callers map.
 */
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

/**
 * What `resetGitRunner` restores. Normally the real subprocess runner;
 * the test preload swaps in a wrapper so that a stub installed by one
 * test and reset in its `afterEach` doesn't discard the suite-wide
 * network tripwire (`tests/helpers/no-network.ts`).
 */
let baseRunner: GitRunner = defaultRunner;

/** Replace the runner that `resetGitRunner` restores. Returns the previous base. */
export function setBaseGitRunner(next: GitRunner): GitRunner {
  const prev = baseRunner;
  baseRunner = next;
  return prev;
}

/** Reset the git runner to the base (real subprocess unless overridden). */
export function resetGitRunner(): void {
  runner = baseRunner;
}

/** §17.1: how long one git command may run before it is stopped. */
const DEFAULT_TIMEOUT_SECONDS = 600;

/** The exit code reported for a git command that was stopped at its deadline, as `timeout(1)` uses. */
export const GIT_TIMED_OUT_EXIT_CODE = 124;

/** §17.1: the deadline in seconds; `CREW_GIT_TIMEOUT_SECONDS` when it is a positive number, else the default. */
export function gitTimeoutSeconds(): number {
  return positiveEnvNumber("CREW_GIT_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS);
}

/**
 * The real runner: invokes `git` via `Bun.spawnSync`. A command still
 * running at its deadline (§17.1) is stopped and reported as a failed
 * command, so a remote that accepts a connection and then stalls cannot
 * hold a `crew` command, and the locks it has taken, forever.
 */
function defaultRunner(args: readonly string[], options: GitRunOptions): GitResult {
  const seconds = gitTimeoutSeconds();
  const proc = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: options.cwd ?? process.cwd(),
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
    // Whole milliseconds: a fractional number of seconds is a valid setting.
    timeout: Math.ceil(seconds * 1000),
  });
  const stdout = proc.stdout?.toString() ?? "";
  const stderr = proc.stderr?.toString() ?? "";
  if (proc.exitedDueToTimeout) {
    const limit = seconds === 1 ? "1 second" : `${seconds} seconds`;
    const stopped = `git did not finish within ${limit} and was stopped`;
    return {
      stdout,
      stderr: [stderr.trim(), stopped].filter(Boolean).join("\n"),
      exitCode: GIT_TIMED_OUT_EXIT_CODE,
      timedOut: true,
    };
  }
  return { stdout, stderr, exitCode: proc.exitCode ?? -1 };
}
