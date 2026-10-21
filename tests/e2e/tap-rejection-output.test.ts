/** Newly exposed tap rejection diagnostics respect output safety (§5.2, §10.1.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
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
import type { UpdateJson } from "./update-dry-run/helpers.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
beforeEach(() => {
  const target = makeTempDir("crew-rejection-output-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

function cli(home: string, args: string[]) {
  const capture = captureStreams();
  const code = runCli(args, { home, streams: capture.streams });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

test("C-UPD-18c/CLI-06b rejection paths and names cannot forge lines or expose credentials", () => {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-rejection-output-repo-");
  makeGitRepo(repo);
  makeSkill(repo, "healthy", skillFrontmatter({ name: "healthy" }));
  commitAll(repo, "valid tracked tap");
  expect(cli(home, ["tap", "add", `file://${repo}`, "team"]).code).toBe(0);
  expect(cli(home, ["install", "team"]).code).toBe(0);
  const path = "rejected\nforged\x1b[31m";
  const name = "https://u:secret@h/x?token=private\x1b[31m";
  makeSkill(repo, path, `name: ${JSON.stringify(name)}\ndescription: invalid name`);
  commitAll(repo, "untrusted rejection location and metadata");

  const human = cli(home, ["update", "--dry-run"]);
  const json = cli(home, ["update", "--dry-run", "--json"]);
  expect([human.code, json.code]).toEqual([1, 1]);
  const parsed = JSON.parse(json.out) as UpdateJson;
  const diagnostic = parsed.tap_reexpand_rows[0]!;
  expect(diagnostic).toEqual({
    name: "team",
    scope: "user",
    tap: "team",
    kind: "tap_error",
    error: { code: "invalid_skill", message: expect.any(String) },
  });
  expect(human.out).toContain("rejected\\x0aforged\\x1b[31m");
  expect(human.out).toContain("invalid characters");
  for (const output of [human.out, diagnostic.error!.message]) {
    expect(output).not.toContain(path);
    expect(output).not.toContain("\x1b");
    expect(output).not.toContain("secret");
    expect(output).not.toContain("private");
  }
  expect(diagnostic.error!.message).not.toContain("\n");
});
