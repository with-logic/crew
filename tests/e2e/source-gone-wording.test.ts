/** Source-neutral missing-skill diagnostics preserve soft outcomes and installed copies (§10.1, C-UPD-46). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";
import { snapshot } from "../helpers/snapshot.ts";
import type { UpdateJson } from "./update-dry-run/helpers.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
beforeEach(() => {
  target = makeTempDir("crew-source-wording-target-");
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = adapter.userPath;
    adapter.detect = () => adapter.name === "claude-code";
  }
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});

function fixture(kind: "path" | "git") {
  const home = makeCrewHome();
  const root = makeTempDir("crew-source-wording-source-");
  if (kind === "git") makeGitRepo(root);
  const demo = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
  const healthy = makeSkill(root, "healthy", skillFrontmatter({ name: "healthy" }));
  if (kind === "git") commitAll(root, "initial skills");
  const setupCodes: number[] = [];
  for (const args of [
    ["tap", "remove", "core", "--force"],
    ["tap", "add", kind === "git" ? `file://${root}` : root, "fixture"],
    [
      "install",
      ...(kind === "git" ? ["fixture"] : ["fixture/demo", "fixture/healthy"]),
      "--agent",
      "claude-code",
    ],
  ])
    setupCodes.push(runCli(args, { home, streams: captureStreams().streams }));
  const installed = join(target, "claude-code");
  const original = readState(home).installations.find((entry) => entry.name === "demo");
  const before = {
    installed: snapshot(installed),
    demo: snapshot(join(installed, "demo")),
    store: snapshot(join(home, "store")),
    state: readFileSync(join(home, "state.json")),
  };
  rmSync(demo, { recursive: true });
  writeFileSync(join(healthy, "changed.txt"), "healthy update\n");
  if (kind === "git") commitAll(root, "remove demo and update healthy");
  return { home, installed, original, before, setupCodes };
}

for (const kind of ["path", "git"] as const) {
  for (const args of [["update"], ["update", "--dry-run"], ["outdated"]]) {
    test(`C-UPD-46 ${kind} missing skill uses neutral wording in ${args.join(" ")}`, () => {
      const f = fixture(kind);
      expect(f.setupCodes).toEqual([0, 0, 0]);
      const dryRun = args.length > 1 || args[0] === "outdated";
      const capture = captureStreams();
      expect(runCli(args, { home: f.home, streams: capture.streams })).toBe(0);
      expect(capture.stdout()).toContain("source no longer available");
      expect(capture.stdout()).toContain("keeping your copy");
      expect(capture.stdout()).not.toContain("removed upstream");
      expect(capture.stderr()).toBe("");
      expect(snapshot(join(f.installed, "demo"))).toEqual(f.before.demo);
      expect(readState(f.home).installations.find((entry) => entry.name === "demo")).toEqual(
        f.original,
      );
      if (dryRun) {
        expect(snapshot(f.installed)).toEqual(f.before.installed);
        expect(snapshot(join(f.home, "store"))).toEqual(f.before.store);
        expect(readFileSync(join(f.home, "state.json"))).toEqual(f.before.state);
      }
      const healthyChange = join(f.installed, "healthy", "changed.txt");
      expect(existsSync(healthyChange)).toBe(!dryRun);
      if (!dryRun) expect(readFileSync(healthyChange, "utf8")).toBe("healthy update\n");

      const json = captureStreams();
      expect(runCli([...args, "--json"], { home: f.home, streams: json.streams })).toBe(0);
      const output = JSON.parse(json.stdout()) as UpdateJson;
      expect(output.rows.find((row) => row.name === "demo")).toEqual({
        name: "demo",
        scope: "user",
        outcome: { kind: "source_gone" },
      });
      expect(output.rows.find((row) => row.name === "healthy")?.outcome.kind).toBe(
        dryRun ? "would_update" : "up_to_date",
      );
    });
  }
}

test("C-UPD-46 soft missing sources remain quiet and JSON takes precedence", () => {
  const f = fixture("path");
  expect(f.setupCodes).toEqual([0, 0, 0]);
  for (const args of [["update"], ["update", "--dry-run"], ["outdated"]]) {
    const quiet = captureStreams();
    expect(runCli([...args, "--quiet"], { home: f.home, streams: quiet.streams })).toBe(0);
    expect(quiet.stdout()).toBe("");
    expect(quiet.stderr()).toBe("");
  }
  const outputs: string[] = [];
  for (const args of [["update", "--dry-run"], ["outdated"]]) {
    const json = captureStreams();
    expect(runCli([...args, "--json", "--quiet"], { home: f.home, streams: json.streams })).toBe(0);
    outputs.push(json.stdout());
    expect(json.stderr()).toBe("");
    const output = JSON.parse(json.stdout()) as UpdateJson;
    expect(output.rows[0]!.outcome).toEqual({ kind: "source_gone" });
  }
  expect(outputs[0]).toBe(outputs[1]);
  expect(snapshot(join(f.installed, "demo"))).toEqual(f.before.demo);
  expect(readState(f.home).installations.find((entry) => entry.name === "demo")).toEqual(
    f.original,
  );
});
