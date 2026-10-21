/** Newly discovered gist children report target failures and retry (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, makeGist } from "./helpers.ts";

const originals = [claudeCodeAdapter, codexAdapter].map((adapter) => ({ ...adapter }));
let home: string;
let roots: string[];
beforeEach(() => {
  home = makeCrewHome();
  roots = [makeTempDir("crew-addition-claude-"), makeTempDir("crew-addition-codex-")];
  claudeCodeAdapter.userPath = () => roots[0]!;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => roots[1]!;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, originals[0]);
  Object.assign(codexAdapter, originals[1]);
  resetGitRunner();
});

function cli(args: string[]) {
  const output = captureStreams();
  const code = runCli(args, { home, streams: output.streams });
  return { code, stdout: output.stdout(), stderr: output.stderr() };
}

for (const blockedTargets of [1, 2]) {
  test(`C-UPD-18i ${blockedTargets} failed addition targets are visible and retryable`, () => {
    const { repo } = makeGist({ "seed.md": gistFile("seed") });
    expect(cli(["install", GIST_URL, "--agent", "claude-code", "--agent", "codex"]).code).toBe(0);
    for (const root of roots.slice(0, blockedTargets)) {
      mkdirSync(join(root, "newbie"));
      writeFileSync(join(root, "newbie", "keep.txt"), "unmanaged\n");
    }
    writeFileSync(join(repo, "newbie.md"), gistFile("newbie"));
    writeFileSync(join(repo, "other.md"), gistFile("other"));
    commitAll(repo, "add two children");

    const update = cli(["update", "--json"]);
    expect(update.code).toBe(1);
    const rows = JSON.parse(update.stdout).tap_reexpand_rows;
    expect(rows.find((row: { name: string }) => row.name === "newbie")).toMatchObject({
      kind: "tap_error",
      error: { code: "untracked_directory" },
    });
    expect(rows.find((row: { name: string }) => row.name === "other")).toMatchObject({
      kind: "added",
    });
    expect(readState(home).installations.some((entry) => entry.name === "newbie")).toBe(false);
    for (const root of roots.slice(blockedTargets))
      expect(existsSync(join(root, "newbie"))).toBe(false);
    for (const root of roots.slice(0, blockedTargets)) {
      expect(readFileSync(join(root, "newbie", "keep.txt"), "utf8")).toBe("unmanaged\n");
      rmSync(join(root, "newbie"), { recursive: true });
    }

    expect(cli(["update"]).code).toBe(0);
    expect(readState(home).installations.find((entry) => entry.name === "newbie")?.agents).toEqual([
      "claude-code",
      "codex",
    ]);
    for (const root of roots) expect(existsSync(join(root, "newbie", ".crew.json"))).toBe(true);
  });
}
