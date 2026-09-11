/**
 * Network tripwire for the test suite.
 *
 * The suite's contract is real filesystem, real local `git`, no network
 * (CLAUDE.md, "Testing philosophy"). That is easy to violate by accident:
 * `crew install` materializes configured taps on demand, so any fixture
 * carrying a remote URL turns a local-looking assertion into a live
 * `git clone`. Those tests then depend on a remote host being reachable
 * and fast, and they hang or fail on an offline runner.
 *
 * This wraps the `setGitRunner` seam and rejects remote-contacting
 * invocations (`clone`, `fetch`, `ls-remote`, `push`, `pull`) whose
 * remote is not a `file://` URL or a local path. Every other `git`
 * invocation runs for real, so this is an assertion about remotes, not
 * a git mock — the "don't mock git" rule stays intact.
 *
 * A test that genuinely needs a remote can opt in with `allowRemoteGit`.
 */

import { type GitRunOptions, setBaseGitRunner, setGitRunner } from "../../src/git/exec.ts";

/** Subcommands that reach the configured remote. */
const REMOTE_OPS = new Set(["clone", "fetch", "ls-remote", "push", "pull"]);

let allowRemotes = false;

/**
 * Violations recorded as they happen. Throwing alone is not enough:
 * crew deliberately soft-fails an unreachable tap (PRD §16.6), so
 * `attribute-bare-name.ts` and `search` swallow the error and the run
 * would go green with the network still contacted. Tests assert on
 * this list via `expectNoRemoteGit()`.
 */
const violations: string[] = [];

/** Every remote git invocation attempted since the last reset. */
export function remoteGitViolations(): readonly string[] {
  return violations;
}

/** Clear the recorded violations. */
export function clearRemoteGitViolations(): void {
  violations.length = 0;
}

/**
 * The failure message for any violations recorded so far, or null when
 * there were none. Clears the record either way, so one offending test
 * doesn't cascade into the next.
 *
 * The preload calls this from a global `afterEach`. Throwing only from
 * the tripwire is not enough: crew soft-fails an unreachable tap by
 * design (PRD §16.6), so several call sites swallow that error and the
 * run would go green with the network still contacted.
 */
export function takeRemoteGitFailure(): string | null {
  if (violations.length === 0) return null;
  const detail = [...new Set(violations)].join(", ");
  clearRemoteGitViolations();
  return `This test contacted the network: ${detail}. See tests/helpers/no-network.ts.`;
}

/**
 * Run `cb` with the tripwire disabled. Nothing in the suite uses this
 * today; it exists so a future test that must reach a remote does so
 * loudly and on purpose.
 */
export function allowRemoteGit<T>(cb: () => T): T {
  const previous = allowRemotes;
  allowRemotes = true;
  try {
    return cb();
  } finally {
    allowRemotes = previous;
  }
}

/** True when `arg` names something on this machine rather than a remote. */
function isLocalRemote(arg: string): boolean {
  return arg.startsWith("file://") || arg.startsWith("/") || arg.startsWith(".");
}

/**
 * The remote a git invocation would contact, or null when it names none.
 * A bare `fetch` inside a clone still reaches that clone's origin, so it
 * is only safe when the clone itself came from a local source — which
 * the clone-time check already guarantees.
 */
function remoteArgument(args: readonly string[]): string | null {
  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    if (arg.includes("://") || arg.startsWith("git@")) return arg;
  }
  return null;
}

export function installNetworkTripwire(): void {
  // `setGitRunner` returns the runner it replaced — the real subprocess
  // runner — and every allowed call delegates straight back to it.
  // The guard also becomes the base, so a test that installs its own
  // stub and calls `resetGitRunner()` in `afterEach` restores the
  // guard rather than the unguarded default.
  const real = setGitRunner(guard);
  setBaseGitRunner(guard);

  function guard(args: readonly string[], options: GitRunOptions) {
    const op = args.find((a) => REMOTE_OPS.has(a));
    const remote = op === undefined ? null : remoteArgument(args);
    if (op !== undefined && remote !== null && !isLocalRemote(remote) && !allowRemotes) {
      violations.push(`git ${op} ${remote}`);
      throw new Error(
        `Test tried to reach the network: \`git ${op} ${remote}\`.\n` +
          "The suite must not contact remote hosts — it makes CI depend on a\n" +
          "third party being reachable, and it hangs on an offline runner.\n" +
          "Point the fixture at a local `file://` repo (tests/helpers/fixtures.ts\n" +
          "`makeGitRepo`), or at a nonexistent local path when the clone is\n" +
          "meant to fail. If a remote is genuinely required, wrap the call in\n" +
          "`allowRemoteGit()` from tests/helpers/no-network.ts.",
      );
    }
    return real(args, options);
  }
}
