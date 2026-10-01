/** Install and clone deletion participate in the tap-lock protocol (§9, §14). */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { deriveAutoTapName } from "../../../src/install/tap-naming.ts";
import { tapLockTarget } from "../../../src/sources/tap-lock.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
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
let previousTimeout: string | undefined;
beforeEach(() => {
  previousTimeout = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
});
afterEach(() => {
  if (previousTimeout === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
  else process.env["CREW_LOCK_TIMEOUT_MS"] = previousTimeout;
});

function setup(): { home: string; repo: string; url: string } {
  const home = makeCrewHome();
  runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
  const repo = makeTempDir("crew-install-lock-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha" }));
  commitAll(repo, "root");
  return { home, repo, url: `file://${repo}` };
}

describe("install clone locking", () => {
  test("C-CONC-01 direct source acquisition locks a newly attributed tap before cloning", () => {
    const { home, url } = setup();
    const name = deriveAutoTapName(url, "");
    const held = acquireLock(tapLockTarget(name, home));
    try {
      const c = captureStreams();
      expect(runCli(["install", url], { home, streams: c.streams })).toBe(7);
      expect(existsSync(tapPath(name, home))).toBe(false);
    } finally {
      held.release();
    }
    expect(runCli(["install", url], { home, streams: captureStreams().streams })).toBe(0);
  });

  test("configured tap installs and tap removal wait for a held clone lock", () => {
    const { home, url } = setup();
    expect(
      runCli(["tap", "add", url, "example"], { home, streams: captureStreams().streams }),
    ).toBe(0);
    const held = acquireLock(tapLockTarget("example", home));
    try {
      for (const args of [
        ["install", "example", "--tap"],
        ["tap", "remove", "example"],
      ]) {
        expect(runCli(args, { home, streams: captureStreams().streams })).toBe(7);
      }
      expect(readConfig(home).taps[0]!.name).toBe("example");
      expect(existsSync(tapPath("example", home))).toBe(true);
    } finally {
      held.release();
    }
  });

  test("dependency discovery locks a new tap before acquiring it", () => {
    const { home, repo, url } = setup();
    const dependency = makeTempDir("crew-dependency-lock-");
    makeGitRepo(dependency);
    makeSkill(dependency, "beta", skillFrontmatter({ name: "beta" }));
    commitAll(dependency, "dependency");
    const depUrl = `file://${dependency}`;
    makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", dependencies: [depUrl] }));
    commitAll(repo, "root");
    const name = deriveAutoTapName(depUrl, "");
    const held = acquireLock(tapLockTarget(name, home));
    try {
      expect(runCli(["install", url], { home, streams: captureStreams().streams })).toBe(7);
      expect(existsSync(tapPath(name, home))).toBe(false);
    } finally {
      held.release();
    }
    expect(runCli(["install", url], { home, streams: captureStreams().streams })).toBe(0);
  });
});
