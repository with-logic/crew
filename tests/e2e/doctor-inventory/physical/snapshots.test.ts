/** Physical snapshots precede owner projection and are fresh per build and scope (§11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ampAdapter } from "../../../../src/agents/amp.ts";
import { ALL_AGENTS } from "../../../../src/agents/registry.ts";
import { runCli } from "../../../../src/cli/main.ts";
import { buildMarkerIndex } from "../../../../src/commands/doctor/markers/index.ts";
import { readState } from "../../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let base: string;
let cwd: string;
beforeEach(() => {
  base = makeTempDir();
  cwd = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => base;
    adapter.projectPath = () => "";
    adapter.detect = () => adapter.name === "claude-code";
  }
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});

function installDemo(home: string): number {
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  return runCli(["install", source, "--agent", "claude-code"], {
    home,
    cwd,
    streams: captureStreams().streams,
  });
}

test("C-STATE-06 a non-owner's physical snapshot reaches a later owner; a new build rereads", () => {
  const home = makeCrewHome();
  expect(installDemo(home)).toBe(0);
  const marker = join(base, "demo", ".crew.json");
  const original = JSON.parse(readFileSync(marker, "utf8"));
  const entries = readState(home).installations;
  let changed = false;
  // Agent Skills has scanned the physical base before Amp resolves its next observation.
  ampAdapter.userPath = () => {
    if (!changed) {
      changed = true;
      writeFileSync(marker, "{broken after first physical observation");
    }
    return base;
  };
  const first = buildMarkerIndex(entries, cwd);
  expect(changed).toBe(true);
  expect(readFileSync(marker, "utf8")).toBe("{broken after first physical observation");
  expect(first.findings).toEqual([]);
  expect(first.markers.map((entry) => entry.record)).toEqual([
    { adapter: "claude-code", scope: "user", installDir: join(base, "demo"), marker: original },
  ]);
  const next = buildMarkerIndex(entries, cwd);
  expect(next.markers).toEqual([]);
  expect(next.findings).toEqual([
    {
      level: "error",
      code: "marker_invalid",
      message: `${marker}: invalid marker; correct its JSON, field types, field values and tap metadata before repair`,
    },
  ]);
});

test("C-STATE-06 physical snapshot keys keep user and project observations separate", () => {
  const home = makeCrewHome();
  expect(installDemo(home)).toBe(0);
  const marker = join(base, "demo", ".crew.json");
  const original = JSON.parse(readFileSync(marker, "utf8"));
  const projectMarker = { ...original, scope: "project" };
  for (const adapter of ALL_AGENTS) adapter.projectPath = () => base;
  let changed = false;
  ALL_AGENTS[0]!.projectPath = () => {
    if (!changed) {
      changed = true;
      writeFileSync(marker, JSON.stringify(projectMarker));
    }
    return base;
  };
  const inventory = buildMarkerIndex(readState(home).installations, cwd);
  expect(changed).toBe(true);
  expect(inventory.findings).toEqual([]);
  expect(inventory.markers).toEqual([
    {
      record: {
        adapter: "claude-code",
        scope: "user",
        installDir: join(base, "demo"),
        marker: original,
      },
    },
    {
      record: {
        adapter: "claude-code",
        scope: "project",
        installDir: join(base, "demo"),
        marker: projectMarker,
      },
      projectRoot: cwd,
    },
  ]);
  expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual(projectMarker);
});
