/** Ordinary promotion failures remain retryable without changing installed payloads (§11.1, §16.5). */
import { expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { promoteExistingTap } from "../../../src/commands/tap/promote.ts";
import { readConfig } from "../../../src/config/load.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildTapRepo } from "./helpers.ts";

for (const failure of ["early-marker", "late-marker", "state", "none"] as const) {
  test(`C-TAP-22 promotion retry converges after ${failure} failure`, () => {
    const home = makeCrewHome();
    const project = makeTempDir();
    const cwd = makeTempDir();
    const target = makeTempDir();
    const repo = buildTapRepo("crew-promotion-retry-", ["widget"]);
    const source = `file://${repo}`;
    const originals = ALL_AGENTS.map((adapter) => ({
      adapter,
      userPath: adapter.userPath,
      projectPath: adapter.projectPath,
      detect: adapter.detect,
    }));
    const launchctl = setLaunchctlRunner(() => false);
    const systemctl = setSystemctlRunner(() => ({ ok: false, stderr: "" }));
    const userDir = join(target, "claude-code", "widget");
    const projectDir = join(project, "targets", "claude-code", "widget");
    const installed = [userDir, projectDir];
    const marker = (dir: string): Marker =>
      JSON.parse(readFileSync(join(dir, ".crew.json"), "utf8"));
    const invoke = (args: string[], at = cwd) => {
      const captured = captureStreams();
      const code = runCli(args, { home, cwd: at, streams: captured.streams, prompt: () => "yes" });
      return { code, stdout: captured.stdout(), stderr: captured.stderr() };
    };
    const addArgs = ["tap", "add", "--recursive", source, "renamed"];
    const blocked = failure === "state" ? home : failure === "late-marker" ? projectDir : userDir;
    let readonly = false;
    try {
      for (const { adapter } of originals) {
        adapter.userPath = () => join(target, adapter.name);
        adapter.projectPath = (root) => join(root, "targets", adapter.name);
        adapter.detect = () => adapter.name === "claude-code";
      }
      expect(invoke(["tap", "remove", "core", "--force"]).code).toBe(0);
      expect(invoke(["install", source, "--agent", "claude-code"]).code).toBe(0);
      expect(
        invoke(["install", source, "--agent", "claude-code", "--scope", "project"], project).code,
      ).toBe(0);
      const config = readConfig(home);
      const auto = config.taps[0]!;
      const beforeState = readState(home);
      const beforeMarkers = installed.map(marker);
      const payloads = installed.map((dir) => readFileSync(join(dir, "SKILL.md")));
      let nativeError: NodeJS.ErrnoException | undefined;
      if (failure !== "none") {
        chmodSync(blocked, 0o555);
        readonly = true;
        if (failure === "state") {
          // Single-process helper boundary avoids the CLI's earlier home-directory state-lock write.
          try {
            promoteExistingTap(home, cwd, config, auto, "renamed", true);
          } catch (err) {
            nativeError = err as NodeJS.ErrnoException;
          }
          expect(nativeError?.code).toBe("EACCES");
        } else {
          const result = invoke(addArgs);
          expect(result.code).toBe(4);
          expect(result.stderr).toContain("EACCES");
          expect(result.stderr).toContain(`${blocked}/.crew.json.tmp-`);
        }
        chmodSync(blocked, 0o755);
        readonly = false;
      }
      const retry = invoke(addArgs);
      expect(retry.code).toBe(0);
      const afterConfig = readConfig(home);
      const afterState = readState(home);
      expect(afterConfig.taps).toEqual([
        { ...auto, name: "renamed", registered: true, discovery: "recursive" },
      ]);
      expect(afterState).toEqual({
        ...beforeState,
        installations: beforeState.installations.map((entry) => ({
          ...entry,
          source: { ...entry.source, tap: "renamed" },
        })),
      });
      for (const [index, dir] of installed.entries()) {
        expect(marker(dir)).toEqual({
          ...beforeMarkers[index]!,
          tap_name: "renamed",
          tap_discovery: "recursive",
        });
        expect(readFileSync(join(dir, "SKILL.md"))).toEqual(payloads[index]!);
      }
      expect(invoke(["doctor", "--repair"]).code).toBe(0);
      expect(readConfig(home)).toEqual(afterConfig);
      expect(readState(home)).toEqual(afterState);
      expect(invoke(addArgs).stdout).toContain("already set up");
      // Confirms the injected helper failure reached state publication, preserving its native identity.
      if (failure === "state") expect(nativeError?.path).toContain(`${home}/state.json.tmp-`);
    } finally {
      if (readonly) chmodSync(blocked, 0o755);
      for (const { adapter, userPath, projectPath, detect } of originals)
        Object.assign(adapter, { userPath, projectPath, detect });
      setLaunchctlRunner(launchctl);
      setSystemctlRunner(systemctl);
    }
  });
}
