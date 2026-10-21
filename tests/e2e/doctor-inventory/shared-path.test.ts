/** Partial shared-path uninstall must survive locked doctor repair (§7.4, §11.1, §11.2). */
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
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { uninstallInChild } from "./helpers.ts";

const sharedOwners = ["claude-code", "codex"];
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
    const base = sharedOwners.includes(adapter.name) ? "shared" : adapter.name;
    adapter.userPath = () => join(target, base);
    adapter.projectPath = (root) => join(root, base);
    adapter.detect = () => sharedOwners.includes(adapter.name);
  }
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

for (const scope of ["user", "project"] as const) {
  test(`C-STATE-06 repair preserves only the surviving owner after a shared ${scope} partial uninstall`, () => {
    const home = makeCrewHome();
    const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    expect(
      runCli(["install", source, "--agent", "claude-code", "--agent", "codex", "--scope", scope], {
        home,
        cwd,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const installDir = join(scope === "user" ? target : cwd, "shared", "demo");
    const markerPath = join(installDir, ".crew.json");
    const skillBytes = readFileSync(join(installDir, "SKILL.md"));
    expect(JSON.parse(readFileSync(markerPath, "utf8")).agents).toEqual(sharedOwners);
    expect(readState(home).installations[0]!.agents).toEqual(sharedOwners);
    let uninstalled = false;
    // Detection follows the initial scan; the actual child CLI removes only one shared owner.
    claudeCodeAdapter.detect = () => {
      claudeCodeAdapter.detect = () => true;
      expect(
        uninstallInChild({ home, target, cwd, scope, sharedOwners, agent: "claude-code" }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: expect.any(String),
      });
      expect(readState(home).installations[0]!.agents).toEqual(["codex"]);
      expect(JSON.parse(readFileSync(markerPath, "utf8")).agents).toEqual(["codex"]);
      uninstalled = true;
      return true;
    };
    expect(runCli(["doctor", "--repair"], { home, cwd, streams: captureStreams().streams })).toBe(
      0,
    );
    expect(uninstalled).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
    expect(readState(home).installations[0]!.agents).toEqual(["codex"]);
    expect(existsSync(markerPath)).toBe(true);
    expect(JSON.parse(readFileSync(markerPath, "utf8")).agents).toEqual(["codex"]);
    expect(readFileSync(join(installDir, "SKILL.md"))).toEqual(skillBytes);
  });
}
