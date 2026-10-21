/** Incomplete filesystem inventories cannot authorize doctor repair (§11.2, C-STATE-14). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
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
let target: string;
beforeEach(() => {
  target = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => false;
  }
  claudeCodeAdapter.detect = () => true;
  setAutoupdatePlatform("darwin");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});

for (const scope of ["user", "project"] as const) {
  const failures =
    scope === "user"
      ? ["read-base", "search-base", "ancestor", "install"]
      : ["read-base", "search-base", "ancestor", "install", "root", "root-parent"];
  for (const failure of failures) {
    test(`C-STATE-14 ${scope} ${failure} inventory failure preserves every repair input`, () => {
      const home = makeCrewHome();
      const parent = makeTempDir();
      const project = join(parent, "project");
      mkdirSync(project);
      const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
      expect(
        runCli(["install", source, "--agent", "claude-code", "--scope", scope], {
          home,
          cwd: project,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const base = join(scope === "user" ? target : project, "claude-code");
      const blocked =
        failure === "ancestor"
          ? dirname(base)
          : failure === "install"
            ? join(base, "demo")
            : failure === "root"
              ? project
              : failure === "root-parent"
                ? parent
                : base;
      const cwd = failure.startsWith("root") ? makeTempDir() : project;
      const mode = failure === "read-base" ? 0o111 : failure === "search-base" ? 0o444 : 0;
      setEnabled(home, true);
      const p = paths(home);
      mkdirSync(dirname(p.autoupdatePlist), { recursive: true });
      writeFileSync(p.autoupdatePlist, "scheduler bytes to preserve\n");
      const orphan = join(p.storeDir, "orphan@12345678");
      mkdirSync(orphan, { recursive: true });
      const files = [p.stateFile, p.configFile, p.autoupdatePlist];
      const before = files.map((path) => readFileSync(path));
      const calls: string[][] = [];
      setLaunchctlRunner(statefulLaunchctl(false, calls));
      chmodSync(blocked, mode);
      try {
        for (const flags of [[], ["--repair"], ["--repair", "--dry-run"]]) {
          for (const json of [true, false]) {
            const cap = captureStreams();
            expect(
              runCli(["doctor", ...flags, ...(json ? ["--json"] : [])], {
                home,
                cwd,
                streams: cap.streams,
              }),
            ).toBe(1);
            if (json) {
              const result = JSON.parse(cap.stdout());
              expect(result.findings).toContainEqual(
                expect.objectContaining({
                  level: "error",
                  code: "marker_unreadable",
                  message: expect.stringContaining(blocked),
                }),
              );
              if (flags.length === 1) expect(result.repairs).toEqual([]);
            } else {
              expect(cap.stdout()).toContain(blocked);
              expect(cap.stdout()).toContain("repair is blocked");
              if (flags.includes("--dry-run"))
                expect(cap.stdout()).toContain("would address 0 findings");
            }
            expect(files.map((path) => readFileSync(path))).toEqual(before);
            expect(existsSync(orphan)).toBe(true);
            expect(calls.every((args) => args[0] === "list")).toBe(true);
          }
        }
      } finally {
        chmodSync(blocked, 0o755);
      }
    });
  }
}
