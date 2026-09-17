/**
 * `crew list --scope` as a filter (§5.1 "`crew list` scope filter").
 *
 * Covers C-LIST-01..03: no flag shows both scopes together, `--scope`
 * narrows to one scope (project rows carry their own identity), and an
 * empty filtered view says so instead of showing the first-run hint.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import type { Scope, StateEntry } from "../../src/core/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccUser: string;
let originals: { user: () => string; project: (c: string) => string; detect: () => boolean };

beforeEach(() => {
  ccUser = makeTempDir("crew-cc-");
  originals = {
    user: claudeCodeAdapter.userPath,
    project: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

const quiet = () => captureStreams().streams;

function installDemo(home: string, scope: "user" | "project", cwd: string): void {
  const src = makeTempDir("crew-src-");
  const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
  const args = scope === "project" ? ["install", "--scope", "project", skill] : ["install", skill];
  if (runCli(args, { home, cwd, streams: quiet() }) !== 0) throw new Error("install failed");
}

/** user + two project installs of `demo`; returns the two project roots. */
function seed(home: string): [string, string] {
  const p1 = makeTempDir("crew-proj-a-");
  const p2 = makeTempDir("crew-proj-b-");
  // Each install gets its own source dir, so the user entry's tap name is
  // distinct from both project entries' — that's what makes the positive
  // row assertion in C-LIST-02 meaningful.
  installDemo(home, "user", p1);
  installDemo(home, "project", p1);
  installDemo(home, "project", p2);
  return [p1, p2];
}

function listJson(home: string, ...extra: string[]) {
  const cap = captureStreams();
  const code = runCli(["list", "--json", ...extra], { home, streams: cap.streams });
  if (code !== 0) throw new Error(`list --json exited ${code}: ${cap.stderr()}`);
  // Derived from the canonical entry type so this shape can't drift from
  // what `crew list --json` actually emits.
  return JSON.parse(cap.stdout()) as {
    scope: Scope | null;
    installations: StateEntry[];
  };
}

function listHuman(home: string, ...extra: string[]): string {
  const cap = captureStreams();
  const code = runCli(["list", ...extra], { home, streams: cap.streams });
  if (code !== 0) throw new Error(`list exited ${code}: ${cap.stderr()}`);
  return cap.stdout();
}

describe("crew list --scope", () => {
  test("C-LIST-01 no --scope shows both scopes together", () => {
    const home = makeCrewHome();
    const [p1, p2] = seed(home);
    const json = listJson(home);
    expect(json.scope).toBeNull();
    expect(json.installations.map((e) => e.scope).sort()).toEqual(["project", "project", "user"]);
    const out = listHuman(home);
    expect(out).toContain("Installed skills (1)");
    expect(out).toContain(`└ in ${p1}`);
    expect(out).toContain(`└ in ${p2}`);
  });

  test("C-LIST-02 --scope user shows only user-scope installs", () => {
    const home = makeCrewHome();
    const [p1] = seed(home);
    const json = listJson(home, "--scope", "user");
    expect(json.scope).toBe("user");
    expect(json.installations.map((e) => e.scope)).toEqual(["user"]);
    // Each install has its own source dir, so the user entry's tap name is
    // distinct from both project entries'.
    const userTap = json.installations[0]!.source.tap;
    const out = listHuman(home, "--scope", "user");
    expect(out).toContain("Installed skills (1) at user scope");
    // The row must actually render — this test would otherwise pass if the
    // user installation disappeared entirely.
    expect(out).toContain("demo");
    expect(out).toContain(userTap);
    expect(out).not.toContain(`in ${p1}`);
    expect(out).not.toContain("└");
  });

  test("C-LIST-02 --scope project shows one identity row per project root", () => {
    const home = makeCrewHome();
    const [p1, p2] = seed(home);
    const json = listJson(home, "--scope", "project");
    expect(json.scope).toBe("project");
    expect(json.installations.map((e) => e.project_root).sort()).toEqual([p1, p2].sort());
    const out = listHuman(home, "--scope", "project");
    expect(out).toContain("Installed skills (1) at project scope");
    expect(out).toContain(`demo in ${p1}`);
    expect(out).toContain(`demo in ${p2}`);
    expect(out).not.toContain("└");
    // Each project row carries the skill's source and version itself.
    expect(out.split("\n").filter((l) => l.includes("local")).length).toBe(2);
  });

  test("C-LIST-03 an empty filtered view says so instead of the first-run hint", () => {
    const home = makeCrewHome();
    installDemo(home, "user", makeTempDir("crew-proj-"));
    const out = listHuman(home, "--scope", "project");
    expect(out).toContain("No skills installed at project scope.");
    expect(out).not.toContain("get started");
    const json = listJson(home, "--scope", "project");
    expect(json.scope).toBe("project");
    expect(json.installations).toEqual([]);
  });

  test("C-LIST-03 the unfiltered first-run hint is unchanged", () => {
    const home = makeCrewHome();
    const out = listHuman(home);
    expect(out).toContain("get started");
    expect(listJson(home).scope).toBeNull();
  });
});
