/**
 * The deadline on git commands that talk to a remote: one still running
 * at the limit is stopped and reported as a failed command. Real git; the
 * command that hangs is a git alias that sleeps, so nothing leaves the machine.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  GIT_TIMED_OUT_EXIT_CODE,
  GitProcessError,
  gitTimeoutSeconds,
  runGit,
} from "../../src/git/exec.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

/** A git command that says something, then sleeps for `seconds`. */
function sleeps(seconds: number): readonly string[] {
  return ["-c", `alias.nap=!echo said-before-sleeping >&2; sleep ${seconds}`, "nap"];
}

const before = process.env["CREW_GIT_TIMEOUT_SECONDS"];
afterEach(() => {
  if (before === undefined) delete process.env["CREW_GIT_TIMEOUT_SECONDS"];
  else process.env["CREW_GIT_TIMEOUT_SECONDS"] = before;
});

/** What `work` throws, or undefined. */
function thrownBy(work: () => unknown): unknown {
  let thrown: unknown;
  try {
    work();
  } catch (err) {
    thrown = err;
  }
  return thrown;
}

describe("the git deadline", () => {
  test("a remote command still running at the limit is stopped and fails", () => {
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "1";
    const started = performance.now();

    const thrown = thrownBy(() => runGit(sleeps(20), { cwd: makeTempDir(), remote: true }));

    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThan(500);
    expect(elapsed).toBeLessThan(10_000);
    expect(thrown).toBeInstanceOf(GitProcessError);
    const { result } = thrown as GitProcessError;
    expect(result.exitCode).toBe(GIT_TIMED_OUT_EXIT_CODE);
    // What git said before it was stopped is kept, ahead of the reason.
    expect(result.stderr).toBe(
      "said-before-sleeping\ngit did not finish within 1 second and was stopped",
    );
  });

  test("a stopped command is an ordinary failure to a caller that tolerates failure", () => {
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "1.0005";

    const result = runGit(sleeps(20), { cwd: makeTempDir(), remote: true, throwOnError: false });

    expect(result.exitCode).toBe(GIT_TIMED_OUT_EXIT_CODE);
    expect(result.stderr).toContain("git did not finish within 1.0005 seconds and was stopped");
  });

  test("a command that does not talk to a remote has no deadline", () => {
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "0.2";

    const result = runGit(sleeps(1), { cwd: makeTempDir() });

    expect(result.exitCode).toBe(0);
  });

  test("the limit is 600 seconds unless the setting is a positive number", () => {
    delete process.env["CREW_GIT_TIMEOUT_SECONDS"];
    expect(gitTimeoutSeconds()).toBe(600);
    for (const value of ["soon", "0", "-5", "", "Infinity"]) {
      process.env["CREW_GIT_TIMEOUT_SECONDS"] = value;
      expect(gitTimeoutSeconds()).toBe(600);
    }
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "45";
    expect(gitTimeoutSeconds()).toBe(45);
  });
});
