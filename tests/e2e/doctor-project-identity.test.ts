/** Doctor drift and repair use the complete install identity (§11.1, §11.2). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { readDoctorMarker } from "../helpers/doctor-marker.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import { installSkill, redirectClaudeCode, restoreClaudeCode } from "../helpers/scoped-install.ts";

const otherAdapters = ALL_AGENTS.filter((adapter) => adapter !== claudeCodeAdapter).map(
  (adapter) => ({
    adapter,
    userPath: adapter.userPath,
    projectPath: adapter.projectPath,
    detect: adapter.detect,
  }),
);
let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
  for (const { adapter } of otherAdapters) {
    adapter.userPath = () => "";
    adapter.projectPath = () => "";
    adapter.detect = () => false;
  }
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
  for (const { adapter, userPath, projectPath, detect } of otherAdapters)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

test("C-STATE-05 another project's marker does not hide missing markers", () => {
  const home = makeCrewHome();
  const first = makeTempDir();
  const second = makeTempDir();
  expect(installSkill(home, "demo", "project", first)).toBe(0);
  expect(installSkill(home, "demo", "project", second)).toBe(0);
  rmSync(join(first, ".claude", "skills", "demo", ".crew.json"));
  const c = captureStreams();
  expect(runCli(["doctor", "--json"], { home, cwd: first, streams: c.streams })).toBe(1);
  expect(
    JSON.parse(c.stdout()).findings.filter(
      (f: { code: string }) => f.code === "state_entry_without_marker",
    ),
  ).toHaveLength(1);
  runCli(["doctor", "--repair"], { home, cwd: first, streams: captureStreams().streams });
  expect(readState(home).installations.map((e) => e.project_root)).toEqual([second]);
});

test("C-STATE-06 repair reconstructs another project and merges agents only there", () => {
  const home = makeCrewHome();
  const first = makeTempDir();
  const second = makeTempDir();
  expect(installSkill(home, "demo", "project", first)).toBe(0);
  expect(installSkill(home, "demo", "project", second)).toBe(0);
  const state = readState(home);
  writeState(
    { ...state, installations: state.installations.filter((e) => e.project_root === first) },
    home,
  );
  const c = captureStreams();
  expect(runCli(["doctor", "--json"], { home, cwd: second, streams: c.streams })).toBe(1);
  expect(
    JSON.parse(c.stdout()).findings.some(
      (f: { code: string }) => f.code === "marker_without_state",
    ),
  ).toBe(true);
  runCli(["doctor", "--repair"], { home, cwd: second, streams: captureStreams().streams });
  expect(
    readState(home)
      .installations.map((e) => e.project_root)
      .sort(),
  ).toEqual([first, second].sort());
  const markerPath = join(second, ".claude", "skills", "demo", ".crew.json");
  const marker = readDoctorMarker(markerPath);
  writeFileSync(markerPath, JSON.stringify({ ...marker, agents: ["claude-code", "codex"] }));
  runCli(["doctor", "--repair"], { home, cwd: second, streams: captureStreams().streams });
  const after = readState(home).installations;
  expect(after.find((e) => e.project_root === first)!.agents).toEqual(["claude-code"]);
  expect(after.find((e) => e.project_root === second)!.agents).toEqual(["claude-code", "codex"]);
});

for (const scope of ["user", "project"] as const) {
  for (const alias of ["same path", "symlink"] as const) {
    test(`C-STATE-05/C-STATE-06 ${scope} marker keeps its scope when bases share ${alias}`, () => {
      const home = makeCrewHome();
      const cwd = makeTempDir();
      const projectBase = alias === "symlink" ? join(cwd, "skills-link") : redirected.userRoot;
      if (alias === "symlink") symlinkSync(redirected.userRoot, projectBase, "dir");
      claudeCodeAdapter.projectPath = () => projectBase;
      expect(installSkill(home, "demo", scope, cwd)).toBe(0);
      const before = readState(home);
      const markerPath = join(redirected.userRoot, "demo", ".crew.json");
      const markerContents = readFileSync(markerPath, "utf8");
      const diagnosis = captureStreams();
      expect(
        runCli(["doctor", "--verify", "--json"], { home, cwd, streams: diagnosis.streams }),
      ).toBe(0);
      expect(JSON.parse(diagnosis.stdout()).findings).toEqual([]);
      expect(runCli(["doctor", "--repair"], { home, cwd, streams: captureStreams().streams })).toBe(
        0,
      );
      expect(readState(home)).toEqual(before);

      rmSync(join(home, "state.json"));
      expect(runCli(["doctor", "--repair"], { home, cwd, streams: captureStreams().streams })).toBe(
        0,
      );
      const rebuilt = readState(home).installations;
      expect(rebuilt).toHaveLength(1);
      expect(rebuilt[0]!.scope).toBe(scope);
      expect(rebuilt[0]!.project_root).toBe(scope === "project" ? cwd : undefined);
      expect(readFileSync(markerPath, "utf8")).toBe(markerContents);
    });
  }
}

test("C-STATE-06 repair preserves physically distinct user and project installs", () => {
  const home = makeCrewHome();
  const cwd = makeTempDir();
  expect(installSkill(home, "demo", "user", cwd)).toBe(0);
  expect(installSkill(home, "demo", "project", cwd)).toBe(0);
  const before = readState(home);
  expect(runCli(["doctor", "--repair"], { home, cwd, streams: captureStreams().streams })).toBe(0);
  expect(readState(home)).toEqual(before);
});

for (const inventoryScope of ["user", "project"] as const) {
  const declaredScope = inventoryScope === "user" ? "project" : "user";
  test(`C-STATE-14 refuses a ${inventoryScope}-base marker declaring ${declaredScope} scope`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir();
    expect(installSkill(home, "demo", inventoryScope, cwd)).toBe(0);
    const before = readState(home);
    const base = inventoryScope === "user" ? redirected.userRoot : join(cwd, ".claude", "skills");
    const markerPath = join(base, "demo", ".crew.json");
    const marker = readDoctorMarker(markerPath);
    writeFileSync(markerPath, JSON.stringify({ ...marker, scope: declaredScope }));
    const paths = [
      join(home, "state.json"),
      join(home, "config.yaml"),
      markerPath,
      join(base, "demo", "SKILL.md"),
    ];
    const bytes = paths.map((path) => readFileSync(path));
    for (const flags of [[], ["--verify"], ["--repair"], ["--repair", "--dry-run"]]) {
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
              code: "marker_invalid",
              message: expect.stringContaining(markerPath),
            }),
          );
          if (flags.length === 1 && flags[0] === "--repair") expect(result.repairs).toEqual([]);
        } else {
          expect(cap.stdout()).toContain("an install marker is invalid; repair is blocked");
          if (flags.includes("--dry-run"))
            expect(cap.stdout()).toContain("would address 0 findings");
        }
        expect(paths.map((path) => readFileSync(path))).toEqual(bytes);
        expect(readState(home)).toEqual(before);
      }
    }
    rmSync(paths[0]!);
    const cap = captureStreams();
    expect(runCli(["doctor", "--repair", "--json"], { home, cwd, streams: cap.streams })).toBe(1);
    expect(existsSync(paths[0]!)).toBe(false);
    expect(paths.slice(1).map((path) => readFileSync(path))).toEqual(bytes.slice(1));
  });
}
