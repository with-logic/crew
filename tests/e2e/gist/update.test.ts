/** Gist file identity persists across updates (§10.1.1; C-GIST-05). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { hashDirectory } from "../../../src/hash/content.ts";
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

test("C-GIST-05 updates a selected file's bytes, SHA, and hash", () => {
  const { repo, sha } = makeGist({ "build.md": gistFile("build", "old") });
  expect(cli(["install", GIST_URL, "--agent", "claude-code"]).code).toBe(0);
  const bytes = gistFile("build", "changed");
  writeFileSync(join(repo, "build.md"), bytes);
  const next = commitAll(repo, "change build");
  expect(next).not.toBe(sha);
  expect(cli(["update", "build"]).code).toBe(0);
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(bytes);
  const entry = readState(home).installations[0]!;
  expect(entry.resolved_sha).toBe(next);
  expect(entry.content_hash).toBe(hashDirectory(join(dest, "build")));
  const marker = JSON.parse(readFileSync(join(dest, "build", ".crew.json"), "utf8"));
  expect(marker.resolved_sha).toBe(next);
  expect(marker.content_hash).toBe(entry.content_hash);
  expect(cli(["update"]).stdout).toContain("up to date");
});

test("C-GIST-05 follows additions beside SKILL.md and preserves removed installs", () => {
  const bytes = gistFile("prd");
  const { repo } = makeGist({ "SKILL.md": bytes });
  expect(cli(["install", GIST_URL, "--agent", "claude-code"]).code).toBe(0);
  writeFileSync(join(repo, "skills"), gistFile("build"));
  commitAll(repo, "add build");
  expect(cli(["update", "--dry-run"]).stdout).toContain("build");
  expect(existsSync(join(dest, "build"))).toBe(false);
  expect(cli(["update"]).code).toBe(0);
  expect(readState(home).installations.find((entry) => entry.name === "build")!.source.path).toBe(
    "skills",
  );
  rmSync(join(repo, "SKILL.md"));
  commitAll(repo, "remove prd");
  const update = cli(["update"]);
  expect(update.code).toBe(0);
  expect(update.stdout).toContain("removed upstream");
  expect(readFileSync(join(dest, "prd", "SKILL.md"), "utf8")).toBe(bytes);
});

test("C-GIST-05 rejects an installed filename replaced by an external symlink", () => {
  const bytes = gistFile("build", "original");
  const { repo } = makeGist({ "build.md": bytes });
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(cli(["install", "snippets/build", "--agent", "claude-code"]).code).toBe(0);
  const outside = makeTempDir();
  writeFileSync(join(outside, "SKILL.md"), gistFile("build", "external"));
  rmSync(join(repo, "build.md"));
  symlinkSync(outside, join(repo, "build.md"));
  commitAll(repo, "replace filename with symlink");
  const update = cli(["update", "build", "--json"]);
  expect(update.code).toBe(1);
  expect(JSON.parse(update.stdout).rows[0].outcome.error.message).toContain("regular file");
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(bytes);
});

test("C-GIST-05 a removed selected file reports source_gone and preserves its install", () => {
  const bytes = gistFile("build");
  const { repo } = makeGist({ "build.md": bytes });
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(cli(["install", "snippets/build", "--agent", "claude-code"]).code).toBe(0);
  rmSync(join(repo, "build.md"));
  commitAll(repo, "remove build");
  const update = cli(["update", "build", "--json"]);
  expect(update.code).toBe(0);
  expect(JSON.parse(update.stdout).rows[0].outcome.kind).toBe("source_gone");
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(bytes);
});

test("C-GIST-05 a selected filename replaced by a directory never reads its SKILL.md", () => {
  const bytes = gistFile("build");
  const { repo } = makeGist({ "build.md": bytes });
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(cli(["install", "snippets/build", "--agent", "claude-code"]).code).toBe(0);
  rmSync(join(repo, "build.md"));
  mkdirSync(join(repo, "build.md"));
  writeFileSync(join(repo, "build.md", "SKILL.md"), gistFile("build", "replacement"));
  commitAll(repo, "replace build with directory");
  const update = cli(["update", "build", "--json"]);
  expect(update.code).toBe(1);
  expect(JSON.parse(update.stdout).rows[0].outcome.error.code).toBe("invalid_skill");
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(bytes);
});
