/** Real Git failure rows redact credential controls and punctuation (§5.2, C-UPD-41). */

import { afterEach, expect, test } from "bun:test";
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { runGit } from "../../src/git/exec.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  cloneDirForTap,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
afterEach(() => Object.assign(claudeCodeAdapter, original));

test.each(
  ["update", "outdated"].flatMap((command) =>
    ["\nBOUNDARY_SECRET", "BOUNDARY_SECRET,"].map((credential) => [command, credential] as const),
  ),
)("C-UPD-41 %s masks real Git query boundary %j", (command, credential) => {
  const home = makeCrewHome();
  const target = makeTempDir("crew-query-boundary-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
  const repo = join(makeTempDir(), `remote.git?token=${credential}`);
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  makeGitRepo(repo);
  runGit(["branch", "feature"], { cwd: repo });
  const setup = captureStreams();
  expect(runCli(["tap", "add", `file://${repo}`, "creds"], { home, streams: setup.streams })).toBe(
    0,
  );
  expect(
    runCli(["install", "creds/demo@feature", "--agent", "claude-code"], {
      home,
      streams: setup.streams,
    }),
  ).toBe(0);
  const before = readState(home);
  expect(before.installations[0]!.tracks_tap).not.toBe(true);
  const manifest = readFileSync(join(target, "demo", "SKILL.md"));
  const marker = readFileSync(join(target, "demo", ".crew.json"));
  const clone = cloneDirForTap("creds", home)!;
  runGit(["update-ref", "-d", "refs/remotes/origin/feature"], { cwd: clone });
  runGit(["update-ref", "-d", "refs/heads/feature"], { cwd: clone });
  renameSync(repo, `${repo}.offline`);
  const capture = captureStreams();
  expect(runCli([command, "demo"], { home, streams: capture.streams })).toBe(1);
  const output = capture.stdout() + capture.stderr();
  expect(output).toContain("source unreachable: git fetch failed");
  expect(output).toContain("token=***");
  expect(output).not.toContain("does not appear to be a git repository");
  expect(output).not.toContain("BOUNDARY_SECRET");
  expect(output).not.toContain("token=***,");
  expect(readState(home)).toEqual(before);
  expect(readFileSync(join(target, "demo", "SKILL.md"))).toEqual(manifest);
  expect(readFileSync(join(target, "demo", ".crew.json"))).toEqual(marker);
});
