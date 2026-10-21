/** Batched gist siblings keep each parent's commit and provenance (§9; C-GIST-06). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
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
  dest = makeTempDir("crew-gist-batch-agent-");
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

test("C-GIST-06 a multi-dependency batch stages every sibling from its pinned commit", () => {
  const expected = {
    alpha: gistFile("alpha", "old alpha"),
    beta: gistFile("beta", "old beta"),
    gamma: gistFile("gamma", "old gamma"),
  };
  const { repo, sha } = makeGist({
    parent: gistFile("build", "parent", Object.keys(expected)),
    ...expected,
  });
  for (const name of Object.keys(expected))
    writeFileSync(join(repo, name), gistFile(name, "new HEAD"));
  commitAll(repo, "change all siblings");
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(cli(["install", `snippets/build@${sha}`, "--agent", "claude-code"]).code).toBe(0);
  for (const [name, bytes] of Object.entries(expected))
    expect(readFileSync(join(dest, name, "SKILL.md"), "utf8")).toBe(bytes);
  const entries = readState(home).installations;
  expect(entries).toHaveLength(4);
  for (const entry of entries) {
    expect(entry.resolved_sha).toBe(sha);
    expect(entry.ref).toBe(sha);
    expect(entry.pinned).toBe(true);
    expect(entry.explicit).toBe(entry.name === "build");
  }
});

test("C-GIST-06 two parent batches resolve sibling files at their own commits", () => {
  const old = { alpha: gistFile("alpha", "old alpha"), beta: gistFile("beta", "old beta") };
  const { repo, sha } = makeGist({ parent: gistFile("first", "first", ["alpha", "beta"]), ...old });
  rmSync(join(repo, "alpha"));
  rmSync(join(repo, "beta"));
  const current = { gamma: gistFile("gamma"), delta: gistFile("delta") };
  writeFileSync(join(repo, "second"), gistFile("second", "second", ["gamma", "delta"]));
  for (const [name, bytes] of Object.entries(current)) writeFileSync(join(repo, name), bytes);
  const head = commitAll(repo, "replace siblings and add a second parent");
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  const result = cli([
    "install",
    `snippets/first@${sha}`,
    `snippets/second@${head}`,
    "--agent",
    "claude-code",
  ]);
  expect(result.code).toBe(0);
  for (const [name, bytes] of Object.entries({ ...old, ...current }))
    expect(readFileSync(join(dest, name, "SKILL.md"), "utf8")).toBe(bytes);
  const entries = readState(home).installations;
  expect(entries).toHaveLength(6);
  for (const entry of entries) {
    const expectedSha = ["first", "alpha", "beta"].includes(entry.name) ? sha : head;
    expect(entry.resolved_sha).toBe(expectedSha);
    expect(entry.ref).toBe(expectedSha);
  }
});
