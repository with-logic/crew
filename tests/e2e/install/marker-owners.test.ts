/** Install markers and stale state preserve adapter ownership in output (§5.4, §7.2, §7.5). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { listInstalledForAgent } from "../../../src/agents/list.ts";
import { runCli } from "../../../src/cli/main.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let agentRoot: string;

beforeEach(() => {
  agentRoot = makeTempDir("crew-marker-owners-");
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});

afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

test("C-INST-04 listing skips markers owned only by another adapter", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", skill, "--agent", "claude-code"], {
      home,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const installDir = join(agentRoot, "demo");
  const markerPath = join(installDir, ".crew.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
  writeFileSync(markerPath, JSON.stringify({ ...marker, agents: ["codex"] }));
  expect(listInstalledForAgent(claudeCodeAdapter, "user", skill)).toEqual([]);
  writeFileSync(markerPath, JSON.stringify(marker));
  expect(listInstalledForAgent(claudeCodeAdapter, "user", skill)).toEqual([
    { adapter: "claude-code", scope: "user", installDir, marker },
  ]);
});

test("C-INST-11 already-installed output keeps retired adapter names without paths", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", skill, "--agent", "claude-code"], {
      home,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const state = readState(home);
  const entry = state.installations[0]!;
  writeState(
    {
      ...state,
      installations: [{ ...entry, agents: [...entry.agents, "retired-agent"] }],
    },
    home,
  );
  const c = captureStreams();
  expect(runCli(["install", skill, "--agent", "claude-code"], { home, streams: c.streams })).toBe(
    0,
  );
  expect(c.stdout()).toContain("(already installed)");
  expect(c.stdout()).toMatch(/^ {4}[-·] retired-agent$/m);
  expect(c.stdout()).toMatch(/[-·]\s+claude-code\s+→.+demo/);
});
