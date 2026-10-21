/** Drift discovered under the repair lock must be reported once (§11.1, §11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
let cwd: string;
beforeEach(() => {
  target = makeTempDir();
  cwd = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => adapter.name === "claude-code";
  }
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

for (const initial of [false, true]) {
  for (const mode of ["json", "human", "quiet"]) {
    test(`C-STATE-05 ${mode} reports ${initial ? "initial" : "locked-only"} missing-marker drift once`, () => {
      const home = makeCrewHome();
      const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
      expect(
        runCli(["install", source, "--agent", "claude-code"], {
          home,
          cwd,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const marker = join(target, "claude-code", "demo", ".crew.json");
      if (initial) rmSync(marker);
      const before = captureStreams();
      expect(runCli(["doctor", "--json"], { home, cwd, streams: before.streams })).toBe(
        initial ? 1 : 0,
      );
      expect(JSON.parse(before.stdout()).findings).toHaveLength(initial ? 1 : 0);
      let interrupted = false;
      // Interrupted uninstall: the marker disappeared after the initial scan, before state write.
      claudeCodeAdapter.detect = () => {
        claudeCodeAdapter.detect = () => true;
        if (!initial) rmSync(marker);
        expect(readState(home).installations).toHaveLength(1);
        interrupted = true;
        return true;
      };
      const cap = captureStreams();
      const flags = mode === "human" ? [] : [`--${mode}`];
      expect(runCli(["doctor", "--repair", ...flags], { home, cwd, streams: cap.streams })).toBe(0);
      expect(interrupted).toBe(true);
      expect(readState(home).installations).toEqual([]);
      expect(cap.stderr()).toBe("");
      if (mode === "json") {
        expect(JSON.parse(cap.stdout()).findings).toEqual([
          expect.objectContaining({ code: "state_entry_without_marker" }),
        ]);
      } else if (mode === "human") {
        expect(cap.stdout()).toContain("1 finding addressed");
        expect(cap.stdout()).not.toContain("Everything looks good");
      } else {
        expect(cap.stdout()).toBe("");
      }
    });
  }
}

test("C-STATE-06 locked-only orphan marker is reported and reconstructed", () => {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", source, "--agent", "claude-code"], {
      home,
      cwd,
      streams: captureStreams().streams,
    }),
  ).toBe(0);

  claudeCodeAdapter.detect = () => {
    claudeCodeAdapter.detect = () => true;
    writeState({ schema_version: 1, installations: [] }, home);
    return true;
  };
  const cap = captureStreams();
  expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(0);
  expect(readState(home).installations).toHaveLength(1);
  expect(readState(home).installations[0]).toMatchObject({ name: "demo", agents: ["claude-code"] });
  expect(JSON.parse(cap.stdout()).findings).toEqual([
    expect.objectContaining({ code: "marker_without_state" }),
  ]);
});

test("C-STATE-05 equal missing-marker messages for distinct projects remain distinct findings", () => {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  for (const root of [cwd, makeTempDir()]) {
    expect(
      runCli(["install", source, "--agent", "claude-code", "--scope", "project"], {
        home,
        cwd: root,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    rmSync(join(root, "claude-code", "demo", ".crew.json"));
  }
  const cap = captureStreams();
  expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(0);
  expect(JSON.parse(cap.stdout()).findings).toHaveLength(2);
  expect(readState(home).installations).toEqual([]);
});
