/** A narrowed tap's sibling dependencies participate in clone locking (§9, §14). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { deriveAutoTapName } from "../../../src/install/tap-naming.ts";
import { tapLockTarget } from "../../../src/sources/tap-lock.ts";
import { readState } from "../../../src/state/load.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let installDir: string;
let previousTimeout: string | undefined;
beforeEach(() => {
  installDir = makeTempDir("crew-sibling-lock-installs-");
  claudeCodeAdapter.userPath = () => installDir;
  claudeCodeAdapter.detect = () => true;
  previousTimeout = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
  if (previousTimeout === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
  else process.env["CREW_LOCK_TIMEOUT_MS"] = previousTimeout;
});

test("C-CONC-01 a discovered sibling tap waits before acquiring its own dependency tree", () => {
  const home = makeCrewHome();
  const invoke = (args: string[]) => runCli(args, { home, streams: captureStreams().streams });
  expect(invoke(["tap", "remove", "core", "--force"])).toBe(0);
  const repo = makeTempDir("crew-sibling-lock-repo-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", dependencies: ["beta"] }));
  makeSkill(repo, "beta", skillFrontmatter({ name: "beta", dependencies: ["gamma"] }));
  makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
  const sha = commitAll(repo, "three sibling dependencies");
  tagRepo(repo, "v1");
  const url = `file://${repo}`;
  const siblingName = deriveAutoTapName(url, "beta");
  const held = acquireLock(tapLockTarget(siblingName, home));
  try {
    expect(invoke(["install", `${url}@v1//alpha`])).toBe(7);
    expect(existsSync(tapPath(siblingName, home))).toBe(false);
    expect(readState(home).installations).toEqual([]);
    for (const name of ["alpha", "beta", "gamma"])
      expect(existsSync(join(installDir, name))).toBe(false);
  } finally {
    held.release();
  }

  expect(invoke(["install", `${url}@v1//alpha`])).toBe(0);
  const installed = readState(home).installations;
  expect(installed.map((entry) => entry.name).sort()).toEqual(["alpha", "beta", "gamma"]);
  for (const entry of installed) {
    expect(entry.resolved_sha).toBe(sha);
    expect(entry.ref).toBe("v1");
  }
});
