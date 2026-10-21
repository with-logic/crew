/** Marker findings block scheduler reconciliation along with state/store repair (§11.2, C-STATE-14). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import type { Marker, Scope } from "../../../src/core/types.ts";
import { writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { setEnabled, statefulLaunchctl, useSchedulerSeams } from "./helpers.ts";

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
    adapter.projectPath = () => "";
    adapter.detect = () => false;
  }
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});

type Scenario =
  | { kind: "malformed" }
  | { kind: "mismatch"; inventoryScope: Scope; declaredScope: Scope };
const scenarios = [
  { kind: "malformed" },
  { kind: "mismatch", inventoryScope: "user", declaredScope: "project" },
  { kind: "mismatch", inventoryScope: "project", declaredScope: "user" },
] satisfies readonly Scenario[];
for (const enabled of [true, false]) {
  for (const scenario of scenarios) {
    const label = scenario.kind === "malformed" ? "malformed" : scenario.inventoryScope;
    test(`C-STATE-14 ${label} invalid marker preserves scheduler when config enabled=${enabled}`, () => {
      const home = makeCrewHome();
      const cwd = makeTempDir();
      setAutoupdatePlatform("darwin");
      setEnabled(home, enabled);
      writeState({ schema_version: 1, installations: [] }, home);
      const p = paths(home);
      mkdirSync(dirname(p.autoupdatePlist), { recursive: true });
      writeFileSync(p.autoupdatePlist, "scheduler bytes to preserve\n");
      const orphan = join(p.storeDir, "orphan@12345678");
      mkdirSync(orphan, { recursive: true });
      const marker = join(target, "claude-code", "demo", ".crew.json");
      mkdirSync(dirname(marker), { recursive: true });
      const fields: Marker = {
        schema_version: 1,
        name: "demo",
        agents: ["claude-code"],
        scope: scenario.kind === "mismatch" ? scenario.declaredScope : "user",
        tap_name: "local",
        tap_kind: "path",
        tap_url: "",
        tap_subpath: "",
        tap_path: cwd,
        path: "",
        ref: null,
        resolved_sha: null,
        content_hash: "abc",
        installed_at: "2026-10-21T00:00:00.000Z",
        installed_by: "crew",
      };
      if (scenario.kind === "mismatch" && scenario.inventoryScope === "project") {
        const adapter = ALL_AGENTS.find((candidate) => candidate.name === "claude-code")!;
        adapter.userPath = () => "";
        adapter.projectPath = () => join(target, "claude-code");
      }
      writeFileSync(marker, scenario.kind === "malformed" ? "{broken" : JSON.stringify(fields));
      const before = [p.configFile, p.stateFile, p.autoupdatePlist].map((path) =>
        readFileSync(path),
      );
      const calls: string[][] = [];
      setLaunchctlRunner(statefulLaunchctl(!enabled, calls));
      const cap = captureStreams();
      expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(1);
      const result = JSON.parse(cap.stdout());
      expect(result.findings).toContainEqual(expect.objectContaining({ code: "marker_invalid" }));
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          code: enabled ? "autoupdate_not_loaded" : "autoupdate_unexpectedly_loaded",
        }),
      );
      expect(result.repairs).toEqual([]);
      expect(calls).toEqual([["list", "sh.crew.autoupdate"]]);
      expect(
        [p.configFile, p.stateFile, p.autoupdatePlist].map((path) => readFileSync(path)),
      ).toEqual(before);
      expect(existsSync(orphan)).toBe(true);
    });
  }
}
