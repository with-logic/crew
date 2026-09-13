/**
 * CLI-level guards on reference input (§8.4 C-REF-22a/22c).
 *
 * A git subpath may not escape its repository — lexically with `..`, or
 * through a committed symlink at the leaf or any parent above it. Each
 * case runs through several entry points because every one reaches
 * acquisition by its own route. Flag guards live in
 * `flag-guards.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
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

describe("reference guards", () => {
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

  test("C-REF-22c a committed symlink subpath cannot escape the clone", () => {
    const home = makeCrewHome();
    // A skill that lives entirely outside the repository...
    const outside = makeTempDir("crew-outside-");
    makeSkill(outside, "pwned", skillFrontmatter({ name: "pwned" }));
    // ...reachable only through a symlink the repo commits. The subpath
    // `evil` is lexically clean, so only a filesystem check catches it.
    const repo = makeTempDir("crew-guard-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    symlinkSync(join(outside, "pwned"), join(repo, "evil"));
    commitAll(repo, "add symlink");

    const capture = captureStreams();
    const code = runCli(["install", "--json", `file://${repo}//evil`], {
      home,
      streams: capture.streams,
    });

    expect(code).toBe(4);
    expect(errorName(capture.stdout())).toBe("invalid_ref");
    expect(existsSync(join(ccRoot, "pwned"))).toBe(false);
  });

  test("C-REF-22c a symlinked PARENT directory cannot escape the clone", () => {
    const home = makeCrewHome();
    // The leaf is an ordinary directory; the *parent* is the symlink, so
    // a leaf-only check would pass this.
    const outside = makeTempDir("crew-outside-");
    makeSkill(outside, "pwned", skillFrontmatter({ name: "pwned" }));
    const repo = makeTempDir("crew-guard-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    symlinkSync(outside, join(repo, "via"));
    commitAll(repo, "add parent symlink");

    const capture = captureStreams();
    const code = runCli(["install", "--json", `file://${repo}//via/pwned`], {
      home,
      streams: capture.streams,
    });

    expect(code).toBe(4);
    expect(errorName(capture.stdout())).toBe("invalid_ref");
  });

  test("C-REF-22a crew info rejects an escaping subpath", () => {
    const home = makeCrewHome();
    const repo = makeRepoWithSkill("demo");
    const capture = captureStreams();
    const code = runCli(["info", "--json", `file://${repo}//../../../etc`], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(4);
    expect(errorName(capture.stdout())).toBe("invalid_ref");
  });
});
