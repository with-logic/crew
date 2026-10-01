/** Uninstall preflight and malformed-root preservation regressions (§7.4, §11.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwdForEntry } from "../../src/agents/adapter.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import { installSkill, redirectClaudeCode, restoreClaudeCode } from "../helpers/scoped-install.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

for (const later of ["missing", "project-only"]) {
  test(`C-UNINST-04 later ${later} selector leaves earlier bytes and state intact`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir();
    expect(installSkill(home, "first", "user", cwd)).toBe(0);
    expect(installSkill(home, "project-only", "project", cwd)).toBe(0);
    const before = readFileSync(join(home, "state.json"), "utf8");
    expect(
      runCli(["uninstall", "first", later], { home, cwd, streams: captureStreams().streams }),
    ).toBe(6);
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    expect(existsSync(join(redirected.userRoot, "first", "SKILL.md"))).toBe(true);
  });
}

test("duplicate selectors refresh state after the first removal", () => {
  const home = makeCrewHome();
  const cwd = makeTempDir();
  expect(installSkill(home, "demo", "user", cwd)).toBe(0);
  expect(
    runCli(["uninstall", "demo", "demo"], { home, cwd, streams: captureStreams().streams }),
  ).toBe(0);
  expect(readState(home).installations).toEqual([]);
});

for (const root of [undefined, "", "relative", 42]) {
  test(`C-STATE-11 malformed root ${String(root)} is retained and never authorizes uninstall`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir();
    expect(installSkill(home, "demo", "project", cwd)).toBe(0);
    const entry = readState(home).installations[0]!;
    const { project_root: _previousRoot, ...rest } = entry;
    const malformed = {
      ...rest,
      tracks_tap: true,
      ...(root === undefined ? {} : { project_root: root }),
    } as unknown as typeof entry;
    writeState({ schema_version: 1, installations: [malformed] }, home);
    const before = readFileSync(join(home, "state.json"), "utf8");
    for (const flags of [[], ["--force"]]) {
      expect(
        runCli(["uninstall", "--scope", "project", ...flags, "demo"], {
          home,
          cwd,
          streams: captureStreams().streams,
        }),
      ).toBe(4);
      expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    }
    expect(existsSync(join(cwd, ".claude", "skills", "demo", "SKILL.md"))).toBe(true);
    expect(() => cwdForEntry(malformed, cwd)).toThrow("project root");
    const update = captureStreams();
    expect(runCli(["update", "demo"], { home, cwd, streams: update.streams })).toBe(0);
    expect(update.stdout()).toContain("skipped");
    expect(readState(home).installations).toContainEqual(malformed);
    const c = captureStreams();
    runCli(["doctor", "--repair", "--json"], { home, cwd: makeTempDir(), streams: c.streams });
    expect(
      JSON.parse(c.stdout()).findings.some(
        (f: { code: string }) => f.code === "missing_project_root",
      ),
    ).toBe(true);
    expect(readState(home).installations).toContainEqual(malformed);
  });
}
