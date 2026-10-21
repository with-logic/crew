/** Trusted project-root aliases remain readable and repairable inventory (§11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
beforeEach(() => {
  const target = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => false;
  }
  claudeCodeAdapter.detect = () => true;
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

test("C-STATE-06/C-STATE-14 doctor inspects and reconstructs a symlinked project root", () => {
  const home = makeCrewHome();
  const project = makeTempDir();
  const cwd = join(makeTempDir(), "project-alias");
  symlinkSync(project, cwd, "dir");
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", source, "--agent", "claude-code", "--scope", "project"], {
      home,
      cwd,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const install = join(project, "claude-code", "demo");
  const marker = join(install, ".crew.json");
  const skill = join(install, "SKILL.md");
  const markerBefore = readFileSync(marker);
  const skillBefore = readFileSync(skill);
  const stateBefore = readState(home);
  expect(stateBefore.installations).toHaveLength(1);
  expect(stateBefore.installations[0]).toMatchObject({
    name: "demo",
    scope: "project",
    project_root: cwd,
    agents: ["claude-code"],
  });
  expect(lstatSync(cwd).isSymbolicLink()).toBe(true);
  expect(lstatSync(install).isDirectory()).toBe(true);
  expect(lstatSync(marker).isFile()).toBe(true);
  const inspection = captureStreams();
  expect(runCli(["doctor", "--verify", "--json"], { home, cwd, streams: inspection.streams })).toBe(
    0,
  );
  expect(JSON.parse(inspection.stdout()).findings).toEqual([]);
  expect(readState(home)).toEqual(stateBefore);

  rmSync(paths(home).stateFile);
  const repair = captureStreams();
  expect(
    runCli(["doctor", "--verify", "--repair", "--json"], { home, cwd, streams: repair.streams }),
  ).toBe(0);
  const findings = JSON.parse(repair.stdout()).findings;
  expect(findings.map((finding: { code: string }) => finding.code)).toEqual([
    "marker_without_state",
    "orphan_store_entry",
  ]);
  expect(findings).toContainEqual({
    level: "error",
    code: "marker_without_state",
    message: `marker at ${join(cwd, "claude-code", "demo")} has no state entry`,
  });
  const rebuilt = readState(home).installations;
  expect(rebuilt).toHaveLength(1);
  expect(rebuilt[0]).toMatchObject({
    name: "demo",
    scope: "project",
    project_root: cwd,
    agents: ["claude-code"],
    content_hash: stateBefore.installations[0]!.content_hash,
  });
  expect(readFileSync(marker)).toEqual(markerBefore);
  expect(readFileSync(skill)).toEqual(skillBefore);
  expect(readlinkSync(cwd)).toBe(project);
  const after = captureStreams();
  expect(runCli(["doctor", "--verify", "--json"], { home, cwd, streams: after.streams })).toBe(0);
  expect(JSON.parse(after.stdout()).findings).toEqual([]);
});
