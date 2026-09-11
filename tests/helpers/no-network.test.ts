/**
 * Tests for the suite's own network tripwire (`./no-network.ts`).
 *
 * These assert the guard the rest of the suite depends on: a remote
 * `git` invocation is rejected and recorded, local sources pass
 * through, and `allowRemoteGit` is a deliberate escape hatch.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runGit } from "../../src/git/exec.ts";
import {
  allowRemoteGit,
  clearRemoteGitViolations,
  remoteGitViolations,
  takeRemoteGitFailure,
} from "./no-network.ts";

// Each case below deliberately trips the tripwire, so clear the record
// before the preload's own afterEach sees it and fails the test.
afterEach(() => {
  clearRemoteGitViolations();
});

describe("network tripwire", () => {
  test("rejects a remote clone and records the violation", () => {
    expect(() => runGit(["clone", "https://github.com/example/nope.git", "/tmp/x"])).toThrow(
      /Test tried to reach the network/,
    );
    expect(remoteGitViolations()).toContain("git clone https://github.com/example/nope.git");
  });

  test("rejects ssh-style remotes", () => {
    expect(() => runGit(["fetch", "git@github.com:example/nope.git"])).toThrow(
      /Test tried to reach the network/,
    );
  });

  test("clearRemoteGitViolations empties the record", () => {
    expect(() => runGit(["ls-remote", "https://example.com/x.git"])).toThrow();
    expect(remoteGitViolations().length).toBeGreaterThan(0);
    clearRemoteGitViolations();
    expect(remoteGitViolations()).toEqual([]);
  });

  test("allows local file:// and path sources through to real git", () => {
    // Reaches real git and fails on a nonexistent repo, not on the guard.
    const result = runGit(["ls-remote", "file:///definitely/not/a/repo"], {
      throwOnError: false,
    });
    expect(result.exitCode).not.toBe(0);
    expect(remoteGitViolations()).toEqual([]);
  });

  test("takeRemoteGitFailure reports and clears a violation", () => {
    expect(takeRemoteGitFailure()).toBeNull();

    expect(() => runGit(["clone", "https://example.com/x.git", "/tmp/y"])).toThrow();
    const failure = takeRemoteGitFailure();
    expect(failure).toContain("This test contacted the network");
    expect(failure).toContain("https://example.com/x.git");

    // The record is cleared, so the next test starts clean.
    expect(takeRemoteGitFailure()).toBeNull();
  });

  test("non-remote subcommands are never guarded", () => {
    const result = runGit(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(remoteGitViolations()).toEqual([]);
  });

  test("allowRemoteGit opts a call out, then restores the guard", () => {
    // Proves the guard is lifted without making a real request: inside
    // `allowRemoteGit` the call reaches git (which rejects the unknown
    // `://` scheme locally) instead of being stopped by the tripwire.
    const result = allowRemoteGit(() =>
      runGit(["ls-remote", "not-a-scheme://example.com/x.git"], { throwOnError: false }),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("Test tried to reach the network");
    expect(remoteGitViolations()).toEqual([]);

    // Outside it, the same shape is stopped before git ever runs.
    expect(() => runGit(["ls-remote", "not-a-scheme://example.com/x.git"])).toThrow(
      /Test tried to reach the network/,
    );
  });
});
