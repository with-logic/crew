/** Invalid recorded source paths block reconstruction and preserve update state (§7.5, §9, §11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import { setLaunchctlRunner } from "../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";
import {
  setEnabled,
  statefulLaunchctl,
  useSchedulerSeams,
} from "./doctor-repair-autoupdate/helpers.ts";

useSchedulerSeams();
const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
beforeEach(() => {
  target = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => adapter.name === "claude-code";
  }
  setAutoupdatePlatform("darwin");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});
for (const path of ["../other", "/absolute", "nul\0name"]) {
  test(`C-STATE-14 marker path ${JSON.stringify(path)} blocks every repair and preview`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir();
    const root = makeTempDir();
    for (const name of ["demo", "healthy"]) makeSkill(root, name, skillFrontmatter({ name }));
    expect(
      runCli(["tap", "add", root, "fixture"], { home, cwd, streams: captureStreams().streams }),
    ).toBe(0);
    expect(
      runCli(["install", "fixture", "--agent", "claude-code"], {
        home,
        cwd,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const markerPath = join(target, "claude-code", "demo", ".crew.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    writeFileSync(markerPath, JSON.stringify({ ...marker, path }));
    setEnabled(home, true);
    const p = paths(home);
    mkdirSync(dirname(p.autoupdatePlist), { recursive: true });
    writeFileSync(p.autoupdatePlist, "scheduler bytes to preserve");
    const orphan = join(p.storeDir, "orphan@12345678");
    mkdirSync(orphan);
    const watched = [
      p.stateFile,
      p.configFile,
      p.autoupdatePlist,
      markerPath,
      join(target, "claude-code", "healthy", ".crew.json"),
    ];
    const before = watched.map((file) => readFileSync(file));
    const calls: string[][] = [];
    setLaunchctlRunner(statefulLaunchctl(false, calls));
    for (const flags of [["--json"], ["--dry-run", "--json"], ["--dry-run"]]) {
      const cap = captureStreams();
      expect(runCli(["doctor", "--repair", ...flags], { home, cwd, streams: cap.streams })).toBe(1);
      if (flags.includes("--json")) {
        const result = JSON.parse(cap.stdout());
        expect(result.findings).toContainEqual(
          expect.objectContaining({
            code: "marker_invalid",
            message: expect.stringContaining(markerPath),
          }),
        );
        if (!flags.includes("--dry-run")) expect(result.repairs).toEqual([]);
      } else {
        expect(cap.stdout()).toContain("would address 0 findings");
      }
      expect(watched.map((file) => readFileSync(file))).toEqual(before);
      expect(existsSync(orphan)).toBe(true);
    }
    expect(calls).toEqual(Array.from({ length: 3 }, () => ["list", "sh.crew.autoupdate"]));
  });
}
test("C-STATE-15 update rejects an invalid recorded location and retains existing bytes and state", () => {
  const home = makeCrewHome();
  const root = makeTempDir();
  makeSkill(root, "demo", skillFrontmatter({ name: "demo" }), "original source");
  const outside = makeSkill(
    makeTempDir(),
    "demo",
    skillFrontmatter({ name: "demo" }),
    "other fixture",
  );
  expect(runCli(["tap", "add", root, "fixture"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  expect(
    runCli(["install", "fixture/demo", "--agent", "claude-code"], {
      home,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const state = readState(home);
  writeState(
    {
      ...state,
      installations: state.installations.map((entry) => ({
        ...entry,
        source: { ...entry.source, path: relative(root, outside) },
      })),
    },
    home,
  );
  const files = [
    paths(home).stateFile,
    paths(home).configFile,
    join(target, "claude-code", "demo", "SKILL.md"),
    join(target, "claude-code", "demo", ".crew.json"),
  ];
  const before = files.map((file) => readFileSync(file));
  const cap = captureStreams();
  expect(runCli(["update", "demo", "--json"], { home, streams: cap.streams })).toBe(1);
  expect(JSON.parse(cap.stdout()).rows[0].outcome).toMatchObject({
    kind: "failed",
    error: { code: "invalid_skill" },
  });
  expect(files.map((file) => readFileSync(file))).toEqual(before);
});
