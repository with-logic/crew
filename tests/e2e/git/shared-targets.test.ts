/** Recorded adapters sharing one destination update together (§7.2, §10.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { groupRecordedTargets } from "../../../src/install/update/reinstall.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

const originals = {
  claude: { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
  codex: { userPath: codexAdapter.userPath, detect: codexAdapter.detect },
};
let targetRoot: string;

beforeEach(() => {
  targetRoot = makeTempDir("crew-update-shared-");
  claudeCodeAdapter.userPath = () => targetRoot;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => targetRoot;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, originals.claude);
  Object.assign(codexAdapter, originals.codex);
});

test("C-UPD-45 recorded adapters share one update group and both outcomes", () => {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-update-shared-source-");
  const source = makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  makeGitRepo(repo);
  expect(
    runCli(["install", `file://${repo}//demo`, "--agent", "claude-code", "--agent", "codex"], {
      home,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const before = readState(home).installations[0]!;
  const groups = groupRecordedTargets(before, repo);
  expect(groups.size).toBe(1);
  expect([...groups.keys()]).toEqual([join(targetRoot, "demo")]);
  const group = groups.get(join(targetRoot, "demo"))!;
  expect(group.map((adapter) => adapter.name)).toEqual([...before.agents]);
  expect(group[0]).toBe(claudeCodeAdapter);
  expect(group[1]).toBe(codexAdapter);

  writeFileSync(join(source, "NEW.md"), "new shared bytes");
  const newSha = commitAll(repo, "v2");
  const capture = captureStreams();
  expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(0);
  expect(JSON.parse(capture.stdout()).rows[0].outcome.per_target).toEqual([
    { agent: "claude-code", kind: "installed" },
    { agent: "codex", kind: "installed" },
  ]);
  const dest = join(targetRoot, "demo");
  const marker = JSON.parse(readFileSync(join(dest, ".crew.json"), "utf8"));
  expect(marker.agents).toEqual(["claude-code", "codex"]);
  expect(marker.resolved_sha).toBe(newSha);
  expect(readFileSync(join(dest, "NEW.md"), "utf8")).toBe("new shared bytes");
  expect(readState(home).installations[0]!.agents).toEqual(before.agents);
  expect(readState(home).installations[0]!.resolved_sha).toBe(newSha);
});
