/**
 * The deadline on git subprocesses (§17.1): a command still running at
 * the limit is stopped and reported as a failed git command. Real git; the
 * command that hangs is a git alias that sleeps, so nothing leaves the machine.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import {
  GIT_TIMED_OUT_EXIT_CODE,
  GitProcessError,
  gitTimeoutSeconds,
  runGit,
  setGitRunner,
} from "../../src/git/exec.ts";
import { remoteCommitOf } from "../../src/git/repo/remote.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

/** A git command that takes far longer than the limits these tests set. */
const HANGS = ["-c", "alias.hang=!sleep 20", "hang"] as const;

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
  test("C-INST-26 a command still running at the limit is stopped and fails, even for a caller that tolerates failure", () => {
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "1";
    const started = performance.now();

    const thrown = thrownBy(() => runGit(HANGS, { cwd: makeTempDir(), throwOnError: false }));

    expect(performance.now() - started).toBeLessThan(10_000);
    expect(thrown).toBeInstanceOf(GitProcessError);
    const { result } = thrown as GitProcessError;
    expect(result.exitCode).toBe(GIT_TIMED_OUT_EXIT_CODE);
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toContain("git did not finish within 1 second and was stopped");
  });

  test("C-INST-26 a remote that stalls past the limit is source_unreachable", () => {
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "2";
    const url = `file://${makeTempDir()}`;
    // The lookup itself is replaced by the command that hangs; real git still runs it.
    const real = setGitRunner((args, options) =>
      real(args[0] === "ls-remote" ? HANGS : args, options),
    );
    const thrown = thrownBy(() => remoteCommitOf(url, "main"));
    setGitRunner(real);

    expect(thrown).toBeInstanceOf(CrewError);
    expect((thrown as CrewError).code).toBe("source_unreachable");
    expect((thrown as CrewError).message).toContain("git did not finish within 2 seconds");
  });

  test("C-INST-26 the limit is 600 seconds unless the setting is a positive number", () => {
    delete process.env["CREW_GIT_TIMEOUT_SECONDS"];
    expect(gitTimeoutSeconds()).toBe(600);
    for (const value of ["soon", "0", "-5", ""]) {
      process.env["CREW_GIT_TIMEOUT_SECONDS"] = value;
      expect(gitTimeoutSeconds()).toBe(600);
    }
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "45";
    expect(gitTimeoutSeconds()).toBe(45);
  });
});
