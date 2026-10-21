/** Real planner fixtures and byte snapshots for local source phase changes (§10.1, C-UPD-44). */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../../../src/cli/args/index.ts";
import { runCli } from "../../../src/cli/main.ts";
import { planLockedUpdate } from "../../../src/commands/update/locked-plan.ts";
import { readConfig } from "../../../src/config/load.ts";
import type { StateEntry } from "../../../src/core/types.ts";
import { hashSourceDirectory, isSourceDirectory } from "../../../src/sources/read.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { snapshot } from "../../helpers/snapshot.ts";

// Preserve the existing fixture import path while sharing its byte snapshot (§10.1).
export { snapshot } from "../../helpers/snapshot.ts";

export function fixture(target: string) {
  const home = makeCrewHome();
  const root = makeTempDir("crew-update-races-");
  const skill = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
  const healthy = makeSkill(root, "healthy", skillFrontmatter({ name: "healthy" }));
  const setupCodes: number[] = [];
  for (const args of [
    ["tap", "add", root, "fixture"],
    ["install", "fixture/demo", "fixture/healthy", "--agent", "claude-code"],
  ])
    setupCodes.push(runCli(args, { home, streams: captureStreams().streams }));
  const state = readState(home);
  const original = state.installations.find((entry) => entry.name === "demo")!;
  const installed = snapshot(join(target, "demo"));
  const allInstalled = snapshot(target);
  const store = snapshot(join(home, "store"));
  const stateBytes = readFileSync(join(home, "state.json"));
  writeFileSync(join(skill, "changed.txt"), "changed source\n");
  writeFileSync(join(healthy, "changed.txt"), "healthy update\n");
  const boundaryChecks: { available: boolean; hashChanged: boolean }[] = [];
  return {
    home,
    root,
    skill,
    target,
    state,
    original,
    installed,
    allInstalled,
    store,
    stateBytes,
    setupCodes,
    boundaryChecks,
  };
}

export type Fixture = ReturnType<typeof fixture>;

/** The entry input getter synchronizes after hashing, immediately before manifest loading. */
export function atLoadBoundary(f: Fixture, mutation: () => void): StateEntry {
  let fired = false;
  return {
    ...f.original,
    get content_hash() {
      if (!fired) {
        fired = true;
        f.boundaryChecks.push({
          available: isSourceDirectory(f.skill),
          hashChanged: hashSourceDirectory(f.skill) !== f.original.content_hash,
        });
        mutation();
      }
      return f.original.content_hash;
    },
  };
}

export function plan(f: Fixture, entry: StateEntry, dryRun: boolean) {
  const state = {
    ...f.state,
    installations: f.state.installations.map((e) => (e === f.original ? entry : e)),
  };
  return planLockedUpdate({
    ctx: {
      flags: parseArgs(["update", ...(dryRun ? ["--dry-run"] : [])]).flags,
      cwd: f.root,
    },
    config: readConfig(f.home),
    home: f.home,
    dryRun,
    taps: [],
    state,
    transitiveSources: new Map(),
    subjects: [],
    initialSelected: state.installations,
  });
}

export function afterPlan(f: Fixture, result: ReturnType<typeof plan>, dryRun: boolean) {
  return {
    installed: snapshot(join(f.target, "demo")),
    entry: result.state.installations.find((e) => e.name === "demo"),
    stateBytes: readFileSync(join(f.home, "state.json")),
    healthy: result.rows.find((row) => row.name === "healthy")?.outcome.kind,
    preview: dryRun
      ? {
          installed: snapshot(f.target),
          store: snapshot(join(f.home, "store")),
          state: result.state,
        }
      : null,
    healthyBytes: dryRun ? null : readFileSync(join(f.target, "healthy", "changed.txt"), "utf8"),
  };
}
