/**
 * `--verbose` (§5.2, C-CLI-06a): progress lines reach stderr only when
 * the flag is set, never pollute stdout, and never leak into a later
 * run in the same process.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;

beforeEach(() => {
  const ccRoot = makeTempDir("crew-cc-");
  const original = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = original.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = original.d;
  };
});
afterEach(() => {
  restore?.();
  restore = null;
});

function makeRepo(): string {
  const repo = makeTempDir("crew-repo-");
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  makeGitRepo(repo);
  return repo;
}

describe("--verbose", () => {
  test("C-CLI-06a emits git, staging, and install lines on stderr only", () => {
    const home = makeCrewHome();
    const repo = makeRepo();
    const capture = captureStreams();
    const code = runCli(["install", "--verbose", `file://${repo}`], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(0);
    const err = capture.stderr();
    expect(err).toContain("crew: $ git clone");
    expect(err).toContain("crew: staging demo@");
    expect(err).toContain("crew: installing demo → ");
    expect(capture.stdout()).not.toContain("crew: ");
  });

  test("C-CLI-06a --json keeps stdout parseable while stderr carries progress", () => {
    const home = makeCrewHome();
    const repo = makeRepo();
    const capture = captureStreams();
    runCli(["install", "--verbose", "--json", `file://${repo}`], {
      home,
      streams: capture.streams,
    });
    expect(JSON.parse(capture.stdout()).records[0].name).toBe("demo");
    expect(capture.stderr()).toContain("crew: $ git");
  });

  test("C-CLI-06a uninstall and reinstall report removal and store reuse", () => {
    const home = makeCrewHome();
    const repo = makeRepo();
    runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });
    const rm = captureStreams();
    runCli(["uninstall", "--verbose", "demo"], { home, streams: rm.streams });
    expect(rm.stderr()).toContain("crew: removing demo from ");
    const again = captureStreams();
    runCli(["install", "--verbose", `file://${repo}`], { home, streams: again.streams });
    expect(again.stderr()).toContain("crew: reusing store entry demo@");
    const upd = captureStreams();
    runCli(["update", "--verbose"], { home, streams: upd.streams });
    expect(upd.stderr()).toContain("crew: refreshing tap ");
    expect(upd.stderr()).toContain("crew: $ git fetch");
  });

  test("C-CLI-06a without the flag nothing is emitted, even after a failed verbose run", () => {
    const home = makeCrewHome();
    const failed = captureStreams();
    const code = runCli(["install", "--verbose", `file://${makeTempDir("crew-nope-")}/missing`], {
      home,
      streams: failed.streams,
    });
    expect(code).not.toBe(0);
    expect(failed.stderr()).toContain("crew: $ git clone");

    const repo = makeRepo();
    const quiet = captureStreams();
    runCli(["install", `file://${repo}`], { home, streams: quiet.streams });
    expect(quiet.stderr()).not.toContain("crew: ");
    expect(quiet.stdout()).not.toContain("crew: ");
  });
});
