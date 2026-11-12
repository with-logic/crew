/**
 * The deadline on git commands that talk to a remote (§17.1, C-INST-26).
 *
 * Real local git, no network. The clone stalls for real: git runs
 * `uploadpack.packObjectsHook` in place of `pack-objects` when serving a
 * `file://` clone, and the hook here sleeps. Git only honours that hook
 * from user-level config, hence the config file.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { type GitRunOptions, setGitRunner } from "../../../src/git/exec.ts";
import { ensureClone, fetchRefs } from "../../../src/git/repo/index.ts";
import { remoteCommitOf } from "../../../src/git/repo/remote.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkillsRepo, makeTempDir } from "../../helpers/fixtures.ts";

const SETTINGS = ["CREW_GIT_TIMEOUT_SECONDS", "GIT_CONFIG_GLOBAL"] as const;

let restore: (() => void) | null = null;
let ccRoot = "";

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const originals = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  const saved = SETTINGS.map((name) => [name, process.env[name]] as const);
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
});
afterEach(() => {
  restore?.();
  restore = null;
});

/** Runs `work` and returns the options each git subcommand in `watched` was run with. */
function optionsGiven(watched: string, work: () => void): GitRunOptions[] {
  const seen: GitRunOptions[] = [];
  const real = setGitRunner((args, options) => {
    if (args[0] === watched) seen.push(options);
    return real(args, options);
  });
  try {
    work();
  } finally {
    setGitRunner(real);
  }
  return seen;
}

describe("the deadline on git commands that talk to a remote", () => {
  test("C-INST-26 an install whose clone stalls past the deadline is source_unreachable", () => {
    const home = makeCrewHome();
    const repo = makeSkillsRepo(["demo"]);
    process.env["CREW_GIT_TIMEOUT_SECONDS"] = "1";
    const stallingConfig = join(makeTempDir("crew-gitconfig-"), "config");
    // The `#` discards the pack-objects arguments git appends.
    writeFileSync(stallingConfig, '[uploadpack]\n\tpackObjectsHook = "sleep 20 #"\n');
    process.env["GIT_CONFIG_GLOBAL"] = stallingConfig;
    const capture = captureStreams();
    const started = performance.now();

    const code = runCli(["install", `file://${repo}//demo`, "--json"], {
      home,
      streams: capture.streams,
    });

    expect(performance.now() - started).toBeLessThan(15_000);
    expect(code).toBe(5);
    const error = JSON.parse(capture.stdout()).error;
    expect(error.name).toBe("source_unreachable");
    expect(error.message).toContain("git did not finish within 1 second and was stopped");
    expect(readdirSync(ccRoot)).toEqual([]);
    // Git removes the clone it was stopped in the middle of, so a retry starts clean.
    expect(readdirSync(join(home, "repos"))).toEqual([]);
  });

  test("C-INST-26 cloning, fetching and asking a remote about a ref are all under the deadline", () => {
    const url = `file://${makeSkillsRepo(["demo"])}`;
    const clone = join(makeTempDir("crew-clone-"), "clone");

    const cloned = optionsGiven("clone", () => ensureClone(url, clone));
    const fetched = optionsGiven("fetch", () => fetchRefs(clone));
    const asked = optionsGiven("ls-remote", () => remoteCommitOf(url, null));

    expect(cloned).toEqual([{ talksToRemote: true }]);
    expect(fetched).toEqual([{ cwd: clone, talksToRemote: true }]);
    expect(asked).toEqual([{ talksToRemote: true }]);
  });
});
