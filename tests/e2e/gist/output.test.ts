/** Gist metadata is terminal-safe without changing JSON or installed bytes (§5.1, C-GIST-02). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { GIST_URL, makeGist } from "./helpers.ts";

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

test("C-GIST-02 human metadata escapes C0/C1 while JSON and installed bytes stay raw", () => {
  const raw = "safe\x1b[31m\x85\x07\nend";
  const quoted = JSON.stringify(raw).replace(/\u0085/g, "\\u0085");
  const bytes = [
    "---",
    "name: build",
    `description: ${quoted}`,
    `license: ${quoted}`,
    `compatibility: ${quoted}`,
    "metadata:",
    "  crew:",
    `    homepage: ${quoted}`,
    "---",
    "Body bytes stay untouched.\n",
  ].join("\n");
  makeGist({ "build.md": bytes });
  const invoke = (args: string[]) => {
    const output = captureStreams();
    const code = runCli(args, { home, streams: output.streams });
    expect(code).toBe(0);
    return output.stdout();
  };
  invoke(["tap", "add", GIST_URL, "snippets"]);
  const skill = JSON.parse(invoke(["info", "snippets/build", "--json"])).skills[0];
  for (const args of [
    ["info", "snippets/build"],
    ["search", "--tap", "snippets"],
    ["install", "snippets/build", "--agent", "claude-code"],
    ["install", "snippets/build", "--agent", "claude-code"],
    ["info", "build"],
  ]) {
    const output = invoke(args);
    expect(output).toContain("safe\\x1b[31m\\x85\\x07\\x0aend");
    for (const control of ["\x1b", "\x85", "\x07"]) expect(output).not.toContain(control);
  }
  for (const field of ["description", "license", "compatibility", "homepage"]) {
    expect(skill[field]).toBe(raw);
  }
  expect(JSON.parse(invoke(["search", "--tap", "snippets", "--json"])).hits[0].description).toBe(
    raw,
  );
  expect(JSON.parse(invoke(["info", "build", "--json"])).description).toBe(raw);
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(bytes);
});
