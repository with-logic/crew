/**
 * CLI-level guards on flag input (§5.2 C-CLI-08a, §5.3 C-INST-02b).
 *
 * A flag that is not marked repeatable may not be passed twice, and a
 * command-specific flag must reach the command that declares it while
 * being rejected everywhere else. Both hold at the command boundary,
 * not only in the parser, so most cases run through `runCli`.
 */

import { describe, expect, test } from "bun:test";
import { parseArgs } from "../../src/cli/args.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

/** A one-skill git repo reachable over `file://`. */
function makeRepoWithSkill(name: string): string {
  const repo = makeTempDir("crew-guard-");
  makeGitRepo(repo);
  makeSkill(repo, name, skillFrontmatter({ name }));
  commitAll(repo, `add ${name}`);
  return repo;
}

describe("flag guards", () => {
  test("C-CLI-08a a repeated boolean flag is a usage_error", () => {
    const home = makeCrewHome();
    // Yargs collapses a repeated boolean to `true`, leaving no trace in
    // the parsed result — so only raw argv can witness these.
    for (const argv of [
      ["install", "--json", "--json", "foo"],
      ["install", "--force", "--force", "foo"],
      ["install", "--recursive", "--recursive", "foo"],
    ]) {
      const capture = captureStreams();
      const code = runCli(argv, { home, streams: capture.streams });
      expect(code).toBe(4);
      expect(capture.stderr()).toContain("more than once");
    }
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

  test("C-INST-02b --from-git reaches install and is rejected elsewhere", () => {
    // Pins both halves of the flag's scope: `install` must receive the
    // value (a round-three review read it as being stripped before the
    // command sees it), and every other command must reject it rather
    // than accepting it silently.
    const installed = parseArgs(["install", "--from-git", "acme/skills"]);
    expect(installed.flags.extras["from-git"]).toBe("acme/skills");

    for (const command of ["list", "search", "uninstall", "update"]) {
      expect(() => parseArgs([command, "--from-git", "acme/skills"])).toThrow(
        /Unknown argument: from-git/,
      );
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
