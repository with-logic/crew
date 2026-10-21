/** Whole-gist updates validate recorded files independently of discovery (§10.1; C-GIST-05). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  dest = makeTempDir("crew-gist-validation-");
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
  return { code, stdout: output.stdout() };
}

test("C-GIST-05 an existing invalid file fails while another whole-gist member updates", () => {
  const originalBytes = gistFile("build", "original");
  const { repo } = makeGist({ build: originalBytes, healthy: gistFile("healthy", "old") });
  expect(cli(["install", GIST_URL, "--agent", "claude-code"]).code).toBe(0);
  const previous = readState(home).installations.find((entry) => entry.name === "build")!;
  const marker = readFileSync(join(dest, "build", ".crew.json"));
  writeFileSync(join(repo, "build"), "---\nname: build\n---\ninvalid description\n");
  const changed = gistFile("healthy", "new");
  writeFileSync(join(repo, "healthy"), changed);
  const nextSha = commitAll(repo, "invalidate build and update healthy");
  const update = cli(["update", "--json"]);
  expect(update.code).toBe(1);
  const rows = JSON.parse(update.stdout).rows;
  expect(rows.find((row: { name: string }) => row.name === "build").outcome).toMatchObject({
    kind: "failed",
    error: { code: "invalid_skill" },
  });
  expect(rows.find((row: { name: string }) => row.name === "healthy").outcome.kind).toBe("updated");
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(originalBytes);
  expect(readFileSync(join(dest, "build", ".crew.json"))).toEqual(marker);
  expect(readState(home).installations.find((entry) => entry.name === "build")).toEqual(previous);
  expect(readFileSync(join(dest, "healthy", "SKILL.md"), "utf8")).toBe(changed);
  expect(
    readState(home).installations.find((entry) => entry.name === "healthy")!.resolved_sha,
  ).toBe(nextSha);
});

test("C-GIST-05 newly encountered invalid files remain ignored on whole-gist update", () => {
  const { repo } = makeGist({ build: gistFile("build") });
  expect(cli(["install", GIST_URL, "--agent", "claude-code"]).code).toBe(0);
  writeFileSync(join(repo, "invalid"), "---\nname: invalid\n---\nmissing description\n");
  commitAll(repo, "add an invalid new file");
  expect(cli(["update"]).code).toBe(0);
  expect(readState(home).installations.map((entry) => entry.name)).toEqual(["build"]);
  expect(existsSync(join(dest, "invalid"))).toBe(false);
});

test("C-GIST-05 a valid declared-name change remains upstream removal plus a new skill", () => {
  const before = gistFile("build");
  const { repo } = makeGist({ skill: before });
  expect(cli(["install", GIST_URL, "--agent", "claude-code"]).code).toBe(0);
  const after = gistFile("renamed");
  writeFileSync(join(repo, "skill"), after);
  commitAll(repo, "rename the declared skill");
  const update = cli(["update", "--json"]);
  expect(update.code).toBe(0);
  expect(
    JSON.parse(update.stdout).rows.find((row: { name: string }) => row.name === "build").outcome
      .kind,
  ).toBe("source_gone");
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(before);
  expect(readFileSync(join(dest, "renamed", "SKILL.md"), "utf8")).toBe(after);
  expect(
    readState(home)
      .installations.map((entry) => entry.name)
      .sort(),
  ).toEqual(["build", "renamed"]);
});
