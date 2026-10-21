/** Gist refs and sibling dependencies use the selected commit (§9; C-GIST-06). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
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

function cli(args: string[]) {
  const output = captureStreams();
  const code = runCli(args, { home, streams: output.streams });
  return { code, stdout: output.stdout(), stderr: output.stderr() };
}

test("C-GIST-06 pinned selected installs read sibling declared names at the parent's commit", () => {
  const old = gistFile("dep", "old dependency");
  const { repo, sha } = makeGist({
    "parent.txt": gistFile("build", "parent", ["dep"]),
    "random.data": old,
  });
  writeFileSync(join(repo, "random.data"), gistFile("dep", "new HEAD"));
  commitAll(repo, "change dependency");
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(cli(["install", `snippets/build@${sha}`, "--agent", "claude-code"]).code).toBe(0);
  expect(readFileSync(join(dest, "dep", "SKILL.md"), "utf8")).toBe(old);
  const state = readState(home);
  expect(state.installations).toHaveLength(2);
  for (const entry of state.installations) {
    expect(entry.resolved_sha).toBe(sha);
    expect(entry.ref).toBe(sha);
    expect(entry.pinned).toBe(true);
  }
  expect(state.installations.find((entry) => entry.name === "dep")!.explicit).toBe(false);
  expect(cli(["update"]).stdout).toContain("skipped");
  expect(cli(["update", "--force"]).code).toBe(0);
  expect(readFileSync(join(dest, "dep", "SKILL.md"), "utf8")).toBe(old);
});

test("C-GIST-06 unpinned dependencies use validated sibling files", () => {
  const bytes = gistFile("dep");
  makeGist({ parent: gistFile("build", "parent", ["dep"]), sibling: bytes });
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(cli(["install", "snippets/build", "--agent", "claude-code"]).code).toBe(0);
  expect(readFileSync(join(dest, "dep", "SKILL.md"), "utf8")).toBe(bytes);
  expect(readState(home).installations.find((entry) => entry.name === "dep")!.source.path).toBe(
    "sibling",
  );
});

test("C-GIST-06 duplicate sibling names keep existing conflicting_dependencies behavior", () => {
  makeGist({
    parent: gistFile("build", "parent", ["dep"]),
    one: gistFile("dep"),
    two: gistFile("dep"),
  });
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  const result = cli(["install", "snippets/build", "--agent", "claude-code", "--json"]);
  expect(result.code).not.toBe(0);
  expect(result.stdout + result.stderr).toContain("conflicting_dependencies");
});
