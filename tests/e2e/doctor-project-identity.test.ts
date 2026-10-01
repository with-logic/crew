/** Doctor drift and repair use the complete install identity (§11.1, §11.2). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import { installSkill, redirectClaudeCode, restoreClaudeCode } from "../helpers/scoped-install.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

test("C-STATE-05 another project's marker does not hide missing markers", () => {
  const home = makeCrewHome();
  const first = makeTempDir();
  const second = makeTempDir();
  expect(installSkill(home, "demo", "project", first)).toBe(0);
  expect(installSkill(home, "demo", "project", second)).toBe(0);
  rmSync(join(first, ".claude", "skills", "demo", ".crew.json"));
  const c = captureStreams();
  expect(runCli(["doctor", "--json"], { home, cwd: first, streams: c.streams })).toBe(1);
  expect(
    JSON.parse(c.stdout()).findings.filter(
      (f: { code: string }) => f.code === "state_entry_without_marker",
    ),
  ).toHaveLength(1);
  runCli(["doctor", "--repair"], { home, cwd: first, streams: captureStreams().streams });
  expect(readState(home).installations.map((e) => e.project_root)).toEqual([second]);
});

test("C-STATE-06 repair reconstructs another project and merges agents only there", () => {
  const home = makeCrewHome();
  const first = makeTempDir();
  const second = makeTempDir();
  expect(installSkill(home, "demo", "project", first)).toBe(0);
  expect(installSkill(home, "demo", "project", second)).toBe(0);
  const state = readState(home);
  writeState(
    { ...state, installations: state.installations.filter((e) => e.project_root === first) },
    home,
  );
  const c = captureStreams();
  expect(runCli(["doctor", "--json"], { home, cwd: second, streams: c.streams })).toBe(1);
  expect(
    JSON.parse(c.stdout()).findings.some(
      (f: { code: string }) => f.code === "marker_without_state",
    ),
  ).toBe(true);
  runCli(["doctor", "--repair"], { home, cwd: second, streams: captureStreams().streams });
  expect(
    readState(home)
      .installations.map((e) => e.project_root)
      .sort(),
  ).toEqual([first, second].sort());
  const markerPath = join(second, ".claude", "skills", "demo", ".crew.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  writeFileSync(markerPath, JSON.stringify({ ...marker, agents: ["claude-code", "codex"] }));
  runCli(["doctor", "--repair"], { home, cwd: second, streams: captureStreams().streams });
  const after = readState(home).installations;
  expect(after.find((e) => e.project_root === first)!.agents).toEqual(["claude-code"]);
  expect(after.find((e) => e.project_root === second)!.agents).toEqual(["claude-code", "codex"]);
});
