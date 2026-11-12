/**
 * The deadline on git subprocesses (§17.1): a command still running at
 * the limit is stopped and reported as a failed git command. Real git; the
 * command that hangs is a git alias that sleeps, so nothing leaves the machine.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { GIT_TIMED_OUT_EXIT_CODE, runGit, setGitRunner } from "../../src/git/exec.ts";
import { remoteCommitOf } from "../../src/git/repo/remote.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

/** A git command that takes far longer than the limits these tests set. */
const HANGS = ["-c", "alias.hang=!sleep 20", "hang"] as const;

const before = process.env["CREW_GIT_TIMEOUT"];
afterEach(() => {
  if (before === undefined) delete process.env["CREW_GIT_TIMEOUT"];
  else process.env["CREW_GIT_TIMEOUT"] = before;
});

describe("the git deadline", () => {
  test("C-INST-26 a command still running at the limit is stopped and reported as failed", () => {
    process.env["CREW_GIT_TIMEOUT"] = "1";
    const started = Date.now();

    const result = runGit(HANGS, { cwd: makeTempDir(), throwOnError: false });

    expect(result.exitCode).toBe(GIT_TIMED_OUT_EXIT_CODE);
    expect(result.stderr).toContain("git did not finish within 1 seconds and was stopped");
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("C-INST-26 a remote that stalls past the limit is source_unreachable", () => {
    process.env["CREW_GIT_TIMEOUT"] = "1";
    const url = `file://${makeTempDir()}`;
    // The lookup itself is replaced by the command that hangs; real git still runs it.
    const real = setGitRunner((args, options) =>
      real(args[0] === "ls-remote" ? HANGS : args, options),
    );
    let thrown: unknown;
    try {
      remoteCommitOf(url, "main");
    } catch (err) {
      thrown = err;
    } finally {
      setGitRunner(real);
    }

    expect(thrown).toBeInstanceOf(CrewError);
    expect((thrown as CrewError).code).toBe("source_unreachable");
    expect((thrown as CrewError).message).toContain("git did not finish within 1 seconds");
  });

  test("C-INST-26 a value that is not a positive number leaves the default limit", () => {
    for (const value of ["soon", "0", "-5"]) {
      process.env["CREW_GIT_TIMEOUT"] = value;
      expect(runGit(["--version"]).exitCode).toBe(0);
    }
  });
});
