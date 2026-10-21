/** Authoritative repair inventories are re-read under the state lock (§11.1, §11.2, §14). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

function uninstallInChild(home: string, scope: string) {
  const script = `
    import { join } from "node:path";
    import { ALL_AGENTS } from ${JSON.stringify(new URL("../../../src/agents/registry.ts", import.meta.url).href)};
    import { runCli } from ${JSON.stringify(new URL("../../../src/cli/main.ts", import.meta.url).href)};
    const { home, target, cwd, scope } = JSON.parse(process.argv[1]);
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => join(target, adapter.name);
      adapter.projectPath = (root) => join(root, adapter.name);
      adapter.detect = () => adapter.name === "claude-code";
    }
    process.exitCode = runCli(["uninstall", "demo", "--scope", scope, "--json"], { home, cwd });
  `;
  const child = Bun.spawnSync(
    [process.execPath, "--eval", script, JSON.stringify({ home, target, cwd, scope })],
    { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
  );
  return {
    exitCode: child.exitCode,
    stderr: child.stderr.toString(),
    stdout: child.stdout.toString(),
  };
}

for (const scope of ["user", "project"] as const) {
  test(`C-STATE-06 repair does not resurrect a ${scope} install uninstalled after checks`, () => {
    const home = makeCrewHome();
    const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    expect(
      runCli(["install", source, "--agent", "claude-code", "--scope", scope], {
        home,
        cwd,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const marker = join(scope === "user" ? target : cwd, "claude-code", "demo", ".crew.json");
    expect(existsSync(marker)).toBe(true);
    const inventoryLockStates: boolean[] = [];
    claudeCodeAdapter.userPath = () => {
      inventoryLockStates.push(existsSync(join(home, "state.json.lock")));
      return join(target, "claude-code");
    };
    let uninstalled = false;
    claudeCodeAdapter.detect = () => {
      claudeCodeAdapter.detect = () => true;
      expect(uninstallInChild(home, scope)).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: expect.any(String),
      });
      expect(readState(home).installations).toEqual([]);
      expect(existsSync(marker)).toBe(false);
      uninstalled = true;
      return true;
    };
    const cap = captureStreams();
    expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(0);
    expect(uninstalled).toBe(true);
    expect(inventoryLockStates[0]).toBe(false);
    expect(inventoryLockStates).toContain(true);
    expect(existsSync(marker)).toBe(false);
    expect(readState(home).installations).toEqual([]);
    expect(JSON.parse(cap.stdout()).repairs).toEqual([]);
    expect(readFileSync(join(home, "state.json"), "utf8")).not.toContain('"demo"');
  });
}

test("C-STATE-06 locked inventory discovers project roots from fresh state", () => {
  const home = makeCrewHome();
  const project = makeTempDir();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", source, "--agent", "claude-code", "--scope", "project"], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const installed = readState(home);
  writeState({ schema_version: 1, installations: [] }, home);
  claudeCodeAdapter.detect = () => {
    claudeCodeAdapter.detect = () => true;
    writeState(installed, home);
    return true;
  };
  const cap = captureStreams();
  expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(0);
  expect(readState(home)).toEqual(installed);
  expect(existsSync(join(project, "claude-code", "demo", ".crew.json"))).toBe(true);
});

for (const flags of [[], ["--repair", "--dry-run"]]) {
  test(`C-STATE-12 doctor ${flags.join(" ")} leaves a fresh state file absent`, () => {
    const home = makeCrewHome();
    expect(existsSync(join(home, "state.json"))).toBe(false);
    expect(runCli(["doctor", ...flags], { home, cwd, streams: captureStreams().streams })).toBe(0);
    expect(existsSync(join(home, "state.json"))).toBe(false);
    expect(existsSync(join(home, "state.json.lock"))).toBe(false);
  });
}
