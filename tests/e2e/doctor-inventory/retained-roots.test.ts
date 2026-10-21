/** Locked repair retains project scan candidates without reusing stale markers (§11.1, §11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import {
  setEnabled,
  statefulLaunchctl,
  useSchedulerSeams,
} from "../doctor-repair-autoupdate/helpers.ts";

useSchedulerSeams();
const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
// Fail a hung child well before the state lock's 30-second acquisition timeout.
const CHILD_TIMEOUT_MS = 10_000;
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

function uninstallInChild(input: { readonly home: string; readonly cwd: string }) {
  const script = `
    import { join } from "node:path";
    import { ALL_AGENTS } from ${JSON.stringify(new URL("../../../src/agents/registry.ts", import.meta.url).href)};
    import { runCli } from ${JSON.stringify(new URL("../../../src/cli/main.ts", import.meta.url).href)};
    const { home, target, cwd } = JSON.parse(process.argv[1]);
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => join(target, adapter.name);
      adapter.projectPath = (root) => join(root, adapter.name);
      adapter.detect = () => adapter.name === "claude-code";
    }
    process.exitCode = runCli(["uninstall", "demo", "--scope", "project", "--json"], { home, cwd });
  `;
  const child = Bun.spawnSync(
    [process.execPath, "--eval", script, JSON.stringify({ ...input, target })],
    { stdout: "pipe", stderr: "pipe", timeout: CHILD_TIMEOUT_MS },
  );
  return { exitCode: child.exitCode, stderr: child.stderr.toString() };
}

for (const invalid of [false, true]) {
  test(`C-STATE-06 C-STATE-14 retained root ${invalid ? "blocks late invalid markers" : "reconstructs a valid orphan"} after last-entry uninstall`, () => {
    const home = makeCrewHome();
    const project = makeTempDir();
    const cwd = makeTempDir();
    for (const name of ["demo", "orphan"]) {
      const source = makeSkill(makeTempDir(), name, skillFrontmatter({ name }));
      expect(
        runCli(["install", source, "--agent", "claude-code", "--scope", "project"], {
          home,
          cwd: project,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
    }
    const installed = readState(home);
    writeState(
      { ...installed, installations: installed.installations.filter((e) => e.name === "demo") },
      home,
    );
    const marker = join(project, "claude-code", "orphan", ".crew.json");
    const demoMarker = join(project, "claude-code", "demo", ".crew.json");
    const markerBefore = readFileSync(marker);
    setEnabled(home, true);
    const p = paths(home);
    mkdirSync(dirname(p.autoupdatePlist), { recursive: true });
    writeFileSync(p.autoupdatePlist, "scheduler bytes to preserve\n");
    const unusedStore = join(p.storeDir, "unused@12345678");
    mkdirSync(unusedStore, { recursive: true });
    writeFileSync(join(unusedStore, "sentinel"), "store bytes to preserve\n");
    const calls: string[][] = [];
    setLaunchctlRunner(statefulLaunchctl(false, calls));
    let postUninstall: Buffer<ArrayBuffer>[] = [];
    // detect runs after the initial marker scan, letting a real uninstall invalidate that inventory.
    claudeCodeAdapter.detect = () => {
      claudeCodeAdapter.detect = () => true;
      expect(uninstallInChild({ home, cwd })).toEqual({ exitCode: 0, stderr: "" });
      expect(readState(home).installations).toEqual([]);
      expect(existsSync(demoMarker)).toBe(false);
      if (invalid) writeFileSync(marker, "{broken");
      postUninstall = [p.stateFile, p.configFile, p.autoupdatePlist].map((path) =>
        readFileSync(path),
      );
      return true;
    };
    const cap = captureStreams();
    expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(
      invalid ? 1 : 0,
    );
    expect(postUninstall).toHaveLength(3);
    expect(existsSync(demoMarker)).toBe(false);
    const result = JSON.parse(cap.stdout());
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "marker_without_state" }),
    );
    if (invalid) {
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          code: "marker_invalid",
          message: expect.stringContaining(marker),
        }),
      );
      expect(result.repairs).toEqual([]);
      expect(calls).toEqual([["list", "sh.crew.autoupdate"]]);
      expect(
        [p.stateFile, p.configFile, p.autoupdatePlist].map((path) => readFileSync(path)),
      ).toEqual(postUninstall);
      expect(readState(home).installations).toEqual([]);
      expect(readFileSync(marker, "utf8")).toBe("{broken");
      expect(readFileSync(join(unusedStore, "sentinel"), "utf8")).toBe("store bytes to preserve\n");
    } else {
      expect(
        readState(home).installations.map((e) => ({ name: e.name, root: e.project_root })),
      ).toEqual([{ name: "orphan", root: project }]);
      expect(readFileSync(marker)).toEqual(markerBefore);
    }
  });
}
