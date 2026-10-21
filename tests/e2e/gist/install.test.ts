/** Gist file installs retain their bytes and source identity (§8.2, §9; C-GIST-02/03). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { hashDirectory } from "../../../src/hash/content.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, makeGist } from "./helpers.ts";

const original = { ...claudeCodeAdapter };
let home: string;
let dest: string;
beforeEach(() => {
  home = makeCrewHome();
  dest = makeTempDir("crew-gist-agent-");
  claudeCodeAdapter.userPath = () => dest;
  claudeCodeAdapter.projectPath = claudeCodeAdapter.userPath;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, original);
  resetGitRunner();
});

test("C-GIST-02 installs each file's exact bytes and records original filenames", () => {
  const files = { "arbitrary.txt": gistFile("prd"), "build.md": gistFile("build") };
  const { sha } = makeGist({ ...files, "README.md": "not a skill" });
  const output = captureStreams();
  expect(
    runCli(["install", GIST_URL, "--agent", "claude-code"], { home, streams: output.streams }),
  ).toBe(0);
  const state = readState(home);
  expect(state.installations).toHaveLength(2);
  for (const [filename, bytes] of Object.entries(files)) {
    const name = filename === "build.md" ? "build" : "prd";
    const installed = join(dest, name);
    expect(readdirSync(installed).sort()).toEqual([".crew.json", "SKILL.md"]);
    expect(readFileSync(join(installed, "SKILL.md"), "utf8")).toBe(bytes);
    const marker = JSON.parse(readFileSync(join(installed, ".crew.json"), "utf8"));
    expect(marker.path).toBe(filename);
    expect(marker.resolved_sha).toBe(sha);
    expect(marker.content_hash).toBe(hashDirectory(installed));
    expect(state.installations.find((entry) => entry.name === name)?.source.path).toBe(filename);
  }
});

test("C-GIST-03 invalid-only gists do not create agent installs", () => {
  makeGist({ "README.md": "documentation", missing: "---\nname: invalid\n---\n" });
  const output = captureStreams();
  expect(
    runCli(["install", GIST_URL, "--agent", "claude-code"], { home, streams: output.streams }),
  ).toBe(4);
  expect(output.stderr()).toContain("no valid skills found");
  expect(readdirSync(dest)).toEqual([]);
});

test("C-GIST-02 duplicate declared names fail before agent installation", () => {
  makeGist({ one: gistFile("same"), two: gistFile("same") });
  const output = captureStreams();
  expect(
    runCli(["install", GIST_URL, "--agent", "claude-code", "--json"], {
      home,
      streams: output.streams,
    }),
  ).not.toBe(0);
  expect(output.stdout() + output.stderr()).toContain("conflicting_dependencies");
  expect(readdirSync(dest)).toEqual([]);
});

test("C-GIST-02 repeated installs reuse the normal directory hash and store entry", () => {
  const bytes = gistFile("build");
  const { sha } = makeGist({ anything: bytes });
  const normal = makeSkill(makeTempDir(), "build", skillFrontmatter({ name: "build" }), "build\n");
  const install = () =>
    runCli(["install", GIST_URL, "--agent", "claude-code"], {
      home,
      streams: captureStreams().streams,
    });
  expect(install()).toBe(0);
  const store = join(home, "store", `build@${sha.slice(0, 8)}`);
  const time = statSync(store).mtimeMs;
  expect(install()).toBe(0);
  expect(statSync(store).mtimeMs).toBe(time);
  expect(readState(home).installations[0]!.content_hash).toBe(hashDirectory(normal));
});

test("C-GIST-03 a file named skills is eligible beside SKILL.md at project scope", () => {
  makeGist({ "SKILL.md": gistFile("root"), skills: gistFile("sibling") });
  const cwd = makeTempDir();
  expect(
    runCli(["install", GIST_URL, "--scope", "project", "--agent", "claude-code"], {
      home,
      cwd,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  expect(existsSync(join(dest, "root", "SKILL.md"))).toBe(true);
  expect(existsSync(join(dest, "sibling", "SKILL.md"))).toBe(true);
});
