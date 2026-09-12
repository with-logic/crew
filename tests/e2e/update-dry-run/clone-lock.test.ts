/**
 * Per-tap clone locking during `crew update` (§14, C-UPD-18d).
 *
 * The race being guarded: a run resolves a tap's SHA, then copies bytes
 * out of that tap's working tree. If another run fast-forwards the
 * clone in between, state records one commit for another's content.
 *
 * A true interleaving test would need two processes and deliberate
 * timing, which is exactly the kind of test that flakes. Instead this
 * asserts the observable contract that makes the race impossible: the
 * lock is actually taken, over the right tap, by both real and dry
 * runs. If `update` did not lock, these runs would sail past a held
 * lock and succeed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { tapLockTarget } from "../../../src/sources/tap-lock.ts";
import { acquireLock } from "../../../src/state/advisory-lock.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { redirectClaudeCode } from "./helpers.ts";

redirectClaudeCode();

// §14's real timeout is 30 s; these tests assert that a run BLOCKS, so
// shorten it rather than waiting.
beforeEach(() => {
  process.env["CREW_LOCK_TIMEOUT_MS"] = "200";
});
afterEach(() => {
  delete process.env["CREW_LOCK_TIMEOUT_MS"];
});

/**
 * Install one skill from a local git tap. Returns the home, the tap
 * name, and the install's exit code — the caller asserts on it, since
 * Biome forbids assertions outside a test body.
 */
function installFromTap(): { home: string; tap: string; code: number } {
  const home = makeCrewHome();
  runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
  const repo = makeTempDir("crew-lock-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "v1" }));
  commitAll(repo, "v1");
  const code = runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });
  const list = captureStreams();
  runCli(["tap", "list", "--json"], { home, streams: list.streams });
  const taps = (JSON.parse(list.stdout()) as { taps: { name: string }[] }).taps;
  return { home, tap: taps[0]!.name, code };
}

describe("C-UPD-18d crew update locks tap clones", () => {
  test("a dry run blocks on a held clone lock instead of reading the clone", () => {
    const { home, tap, code } = installFromTap();
    expect(code).toBe(0);
    // Stand in for a concurrent run that is mid-refresh on this tap.
    const held = acquireLock(tapLockTarget(tap, home));
    try {
      const c = captureStreams();
      // 7 = state_locked (§15). A dry run still fetches, so it must
      // wait for the clone rather than racing the other run.
      expect(runCli(["update", "--dry-run"], { home, streams: c.streams })).toBe(7);
    } finally {
      held.release();
    }
  });

  test("a real run blocks on the same lock", () => {
    const { home, tap, code } = installFromTap();
    expect(code).toBe(0);
    const held = acquireLock(tapLockTarget(tap, home));
    try {
      const c = captureStreams();
      expect(runCli(["update"], { home, streams: c.streams })).toBe(7);
    } finally {
      held.release();
    }
  });

  test("an unrelated tap's lock does not block the run", () => {
    const { home, code } = installFromTap();
    expect(code).toBe(0);
    const held = acquireLock(tapLockTarget("some-other-tap", home));
    try {
      const c = captureStreams();
      expect(runCli(["update", "--dry-run"], { home, streams: c.streams })).toBe(0);
    } finally {
      held.release();
    }
  });
});
