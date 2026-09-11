/**
 * CLI-level guards on reference and flag input (§8.4 C-REF-22a, §5.2 C-CLI-08a).
 *
 * Two guards that have to hold at the command boundary, not just in the
 * parser: a git subpath may not escape its repository, and a flag that
 * takes one value may not be passed twice. The subpath cases run through
 * three separate entry points because each reaches acquisition by its
 * own route.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot = "";

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const originals = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
  };
});
afterEach(() => {
  restore?.();
  restore = null;
});

function makeRepoWithSkill(name: string): string {
  const repo = makeTempDir("crew-guard-");
  makeGitRepo(repo);
  makeSkill(repo, name, skillFrontmatter({ name }));
  commitAll(repo, `add ${name}`);
  return repo;
}

/** Parse a `--json` error payload's stable error name. */
function errorName(stdout: string): string {
  return (JSON.parse(stdout) as { error: { name: string } }).error.name;
}

describe("reference and flag guards", () => {
  test("C-REF-22a --from-git rejects a subpath that escapes the repo", () => {
    const home = makeCrewHome();
    const repo = makeRepoWithSkill("demo");
    const capture = captureStreams();
    const code = runCli(["install", "--json", "--from-git", `file://${repo}//../../../etc`], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(4);
    expect(errorName(capture.stdout())).toBe("invalid_ref");
  });

  test("C-REF-22a a positional git URL rejects an escaping subpath", () => {
    const home = makeCrewHome();
    const repo = makeRepoWithSkill("demo");
    const capture = captureStreams();
    const code = runCli(["install", "--json", `file://${repo}//../../../etc`], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(4);
    expect(errorName(capture.stdout())).toBe("invalid_ref");
  });

  test("C-REF-22a crew tap add rejects an escaping subpath", () => {
    const home = makeCrewHome();
    const repo = makeRepoWithSkill("demo");
    const capture = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}//../../../etc`, "escapee"], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("..");
  });

  test("C-CLI-08a a repeated single-value flag is a usage_error", () => {
    const home = makeCrewHome();
    for (const argv of [
      ["install", "--from-git", "@a/b", "--from-git", "@c/d"],
      ["install", "--scope", "user", "--scope", "project", "foo"],
    ]) {
      const capture = captureStreams();
      const code = runCli(argv, { home, streams: capture.streams });
      expect(code).toBe(4);
      expect(capture.stderr()).toContain("more than once");
    }
  });

  test("C-CLI-08a the repeatable --agent flag still collects every value", () => {
    const home = makeCrewHome();
    const repo = makeRepoWithSkill("demo");
    const code = runCli(
      ["install", "--agent", "claude-code", "--agent", "codex", `file://${repo}//demo`],
      { home, streams: captureStreams().streams },
    );
    expect(code).toBe(0);
  });
});
