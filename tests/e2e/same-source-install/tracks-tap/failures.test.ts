/**
 * The edges of a whole install's reinstall that moves a tracking entry
 * (§5.4, §11.1; C-UPD-16b). The entry's markers in agents the run didn't
 * touch follow the move, at user and project scope; one that couldn't
 * fails the run before anything is written, leaving the move to a retry,
 * which completes it. A reinstall that fails on every agent leaves the
 * entry, its subscription, its markers, and its tap as they were.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo, install } from "../helpers.ts";
import { addSiblingAndUpdate, crew, markerTap, tapOf, tracking } from "./helpers.ts";

type Redirect = Pick<typeof codexAdapter, "userPath" | "projectPath" | "detect">;
let originals: (readonly [Redirect, Redirect])[] = [];
beforeEach(() => {
  originals = [];
  // Every install names its agents, so codex takes part only where a test
  // names it.
  for (const [adapter, dot] of [
    [claudeCodeAdapter, ".claude"],
    [codexAdapter, ".codex"],
  ] as const) {
    const { userPath, projectPath, detect } = adapter;
    originals.push([adapter, { userPath, projectPath, detect }]);
    const root = makeTempDir("crew-agent-");
    adapter.userPath = () => root;
    adapter.projectPath = (cwd: string) => join(cwd, dot, "skills");
    adapter.detect = () => true;
  }
});
afterEach(() => {
  for (const [adapter, original] of originals) Object.assign(adapter, original);
});

const CLAUDE = ["--agent", "claude-code"];
const BOTH = [...CLAUDE, "--agent", "codex"];

for (const scope of ["user", "project"] as const) {
  test(`C-UPD-16b a reinstall that moves an entry moves its markers in agents it didn't touch (${scope})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    const project = makeTempDir("crew-project-");
    const cwd = scope === "project" ? project : undefined;
    const at = scope === "project" ? ["--scope", "project"] : [];
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...at, ...BOTH], cwd)).toBe(0);
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    // Reinstalled into claude-code only; codex's copy stays as it was.
    expect(crew(home, ["install", `file://${repo}@v1`, ...at, ...CLAUDE, "--force"], cwd)).toBe(0);
    expect(tapOf(home, "a")).not.toBe(ownTap);
    const codexRoot = cwd ? codexAdapter.projectPath(cwd) : codexAdapter.userPath();
    expect(markerTap(codexRoot, "a")).toBe(tapOf(home, "a"));
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(false);
  });
}

test("C-UPD-16b a marker that couldn't follow the move fails the run before anything is written; a retry completes it", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["install", `file://${repo}//skills/a`, ...BOTH])).toBe(0);
  const ownTap = tapOf(home, "a");
  tagRepo(repo, "v1");
  const theirs = join(codexAdapter.userPath(), "a");
  chmodSync(theirs, 0o555);
  try {
    expect(crew(home, ["install", `file://${repo}@v1`, ...CLAUDE, "--force"])).not.toBe(0);
  } finally {
    chmodSync(theirs, 0o755);
  }
  // Refused before anything was written: no copy reinstalled, no sibling.
  expect(tapOf(home, "a")).toBe(ownTap);
  expect(markerTap(claudeCodeAdapter.userPath(), "a")).toBe(ownTap);
  expect(existsSync(join(claudeCodeAdapter.userPath(), "b"))).toBe(false);

  expect(crew(home, ["install", `file://${repo}@v1`, ...CLAUDE, "--force"])).toBe(0);
  expect(tapOf(home, "a")).not.toBe(ownTap);
  for (const root of [claudeCodeAdapter.userPath(), codexAdapter.userPath()])
    expect(markerTap(root, "a")).toBe(tapOf(home, "a"));
});

for (const at of ["@v1", ""]) {
  test(`C-UPD-16b a failed reinstall leaves the entry, its subscription, its markers, and its tap as they were (${at || "same ref"})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(install(home, `file://${repo}//skills`).code).toBe(0);
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    // claude-code's folder can't be written, so every reinstall fails.
    const root = claudeCodeAdapter.userPath();
    chmodSync(root, 0o555);
    try {
      expect(crew(home, ["install", `file://${repo}${at}`, ...CLAUDE, "--force"])).toBe(1);
    } finally {
      chmodSync(root, 0o755);
    }
    expect([tapOf(home, "a"), tapOf(home, "b")]).toEqual([ownTap, ownTap]);
    expect([markerTap(root, "a"), markerTap(root, "b")]).toEqual([ownTap, ownTap]);
    expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:-:true"]);
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(true);

    // Still following its own tap: a sibling added there arrives.
    expect(addSiblingAndUpdate(home, repo)).toBe(0);
    expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:-:true", "c:auto:-:true"]);
  });
}
