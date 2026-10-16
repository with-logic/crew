/**
 * A whole install that reinstalls an entry tracking an auto tap of its
 * own (§5.4, §11.1; C-UPD-16b). The entry ends at the install's ref, which
 * the install subscribes to, so it moves onto the install's tap and
 * tracks it there — whether a new commit, `--force`, or a new agent made
 * the reinstall, at the same ref or another — and its own tap, left empty,
 * is collected. The move is the reinstall's: one that fails leaves the
 * entry, its subscription, and its tap as they were.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import {
  commitAll,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../../helpers/fixtures.ts";
import { buildRepo, install } from "../helpers.ts";
import { addSiblingAndUpdate, crew, tapOf, tracking } from "./helpers.ts";

type Redirect = { userPath: () => string; detect: () => boolean };
let originals: (readonly [Redirect, Redirect])[] = [];
beforeEach(() => {
  originals = [];
  // Every install names its agents: codex takes part only as the new one.
  for (const adapter of [claudeCodeAdapter, codexAdapter]) {
    originals.push([adapter, { userPath: adapter.userPath, detect: adapter.detect }]);
    const root = makeTempDir("crew-agent-");
    adapter.userPath = () => root;
    adapter.detect = () => true;
  }
});
afterEach(() => {
  for (const [adapter, original] of originals) Object.assign(adapter, original);
});

const CLAUDE = ["--agent", "claude-code"];
const REINSTALLS: readonly { how: string; at: string; flags: string[]; edit: boolean }[] = [
  { how: "--force, at a tag", at: "@v1", flags: [...CLAUDE, "--force"], edit: false },
  { how: "a new commit, at a tag", at: "@v1", flags: CLAUDE, edit: true },
  { how: "a new agent, at a tag", at: "@v1", flags: [...CLAUDE, "--agent", "codex"], edit: false },
  { how: "--force, at the same ref", at: "", flags: [...CLAUDE, "--force"], edit: false },
];

for (const { how, at, flags, edit } of REINSTALLS) {
  test(`C-UPD-16b a whole install that reinstalls a tracking entry moves it, tracking (${how})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(install(home, `file://${repo}//skills/a`).code).toBe(0);
    const ownTap = tapOf(home, "a");
    expect(ownTap).toBeString();
    if (edit) {
      makeSkill(join(repo, "skills"), "a", skillFrontmatter({ name: "a" }), "Edited.\n");
      commitAll(repo, "edit a");
    }
    tagRepo(repo, "v1");
    expect(crew(home, ["install", `file://${repo}${at}`, ...flags])).toBe(0);
    expect(tapOf(home, "a")).not.toBe(ownTap);
    const ref = at === "" ? "-" : "v1";
    expect(tracking(home)).toEqual([`a:auto:${ref}:true`, `b:auto:${ref}:true`]);
    // Its own one-skill tap, left with nothing, is collected.
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(false);
  });
}

test("C-UPD-16b a reinstall that moves an entry moves its markers in agents it didn't touch", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  const both = [...CLAUDE, "--agent", "codex"];
  expect(crew(home, ["install", `file://${repo}//skills/a`, ...both])).toBe(0);
  tagRepo(repo, "v1");
  // Reinstalled into claude-code only; codex's copy stays as it was.
  expect(crew(home, ["install", `file://${repo}@v1`, ...CLAUDE, "--force"])).toBe(0);
  const marker = JSON.parse(readFileSync(join(codexAdapter.userPath(), "a", ".crew.json"), "utf8"));
  expect(marker.tap_name).toBe(tapOf(home, "a"));
});

for (const at of ["@v1", ""]) {
  test(`C-UPD-16b a failed reinstall leaves the entry, its subscription, and its tap as they were (${at || "same ref"})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(install(home, `file://${repo}//skills`).code).toBe(0);
    const ownTap = tapOf(home, "a");
    expect(ownTap).toBeString();
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
    expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:-:true"]);
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(true);

    // Still following its own tap: a sibling added there arrives.
    expect(addSiblingAndUpdate(home, repo)).toBe(0);
    expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:-:true", "c:auto:-:true"]);
  });
}
