/**
 * A move whose markers can't follow (§5.4, §11.1; C-INST-13m): a copy whose
 * folder crew can't write, or whose marker it can't parse — in an agent
 * the run doesn't target, or in any agent for an entry the install finds
 * already installed — refuses the run before any config, marker, or state
 * is written, and a retry completes it. A copy whose marker names another
 * tap isn't the move's, nor is a path that can't hold a marker.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../../src/cli/main.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import { tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo } from "../helpers.ts";
import {
  BOTH,
  CLAUDE,
  crew,
  markerTap,
  NOT_MARKERS,
  redirectAgents,
  tapKept,
  tapOf,
  tracking,
} from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/**
 * Ways an untouched agent's copy can't follow a move: how to cause each,
 * returning its undo, and whether the refusal names the copy (a marker
 * that can't be parsed is the deferred raw-error case).
 */
const UNFOLLOWABLE: readonly (readonly [string, (copy: string) => () => void, boolean])[] = [
  [
    "folder can't be written",
    (copy) => {
      chmodSync(copy, 0o555);
      return () => chmodSync(copy, 0o755);
    },
    true,
  ],
  [
    "marker can't be parsed",
    (copy) => {
      const before = readFileSync(join(copy, ".crew.json"), "utf8");
      writeFileSync(join(copy, ".crew.json"), "{not json");
      return () => writeFileSync(join(copy, ".crew.json"), before);
    },
    false,
  ],
];

for (const [what, spoil, namesCopy] of UNFOLLOWABLE) {
  test(`C-INST-13m an untouched copy whose ${what} refuses the run before anything is written; a retry completes it`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...BOTH])).toBe(0);
    const ownTap = tapOf(home, "a");
    const taps = readConfig(home).taps.map((t) => t.name);
    tagRepo(repo, "v1");
    const codexCopy = join(codexAdapter.userPath(), "a");
    const restore = spoil(codexCopy);
    const reinstall = ["install", `file://${repo}@v1`, ...CLAUDE, "--force"];
    const cap = captureStreams();
    try {
      expect(crew(home, [...reinstall, "--dry-run"])).toBe(4);
      expect(runCli(reinstall, { home, streams: cap.streams })).toBe(4);
    } finally {
      restore();
    }
    if (namesCopy) expect(cap.stderr().replace(/\s+/g, " ")).toContain(codexCopy);
    // No copy reinstalled, no sibling, no tap added.
    expect(tapOf(home, "a")).toBe(ownTap);
    expect(markerTap(claudeCodeAdapter.userPath(), "a")).toBe(ownTap);
    expect(existsSync(join(claudeCodeAdapter.userPath(), "b"))).toBe(false);
    expect(readConfig(home).taps.map((t) => t.name)).toEqual(taps);

    expect(crew(home, reinstall)).toBe(0);
    expect(tracking(home)).toEqual(["a:auto:v1:true", "b:auto:v1:true"]);
    for (const root of [claudeCodeAdapter.userPath(), codexAdapter.userPath()])
      expect(markerTap(root, "a")).toBe(tapOf(home, "a"));
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(false);
  });
}

test("C-INST-13m a copy whose marker names another tap isn't the move's, and doesn't stop it", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["install", `file://${repo}//skills/a`, ...BOTH])).toBe(0);
  tagRepo(repo, "v1");
  const codexCopy = join(codexAdapter.userPath(), "a");
  const markerPath = join(codexCopy, ".crew.json");
  writeFileSync(
    markerPath,
    JSON.stringify({ ...JSON.parse(readFileSync(markerPath, "utf8")), tap_name: "elsewhere" }),
  );
  chmodSync(codexCopy, 0o555);
  try {
    expect(crew(home, ["install", `file://${repo}@v1`, ...CLAUDE, "--force"])).toBe(0);
  } finally {
    chmodSync(codexCopy, 0o755);
  }
  expect(markerTap(codexAdapter.userPath(), "a")).toBe("elsewhere");
  expect(markerTap(claudeCodeAdapter.userPath(), "a")).toBe(tapOf(home, "a"));
});

for (const [what, plant] of NOT_MARKERS) {
  test(`C-INST-13m ${what} at an untouched agent holds no marker, and doesn't stop the move`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...CLAUDE])).toBe(0);
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    const intact = plant(join(geminiCliAdapter.userPath(), "a"));
    const reinstall = ["install", `file://${repo}@v1`, ...CLAUDE, "--force"];
    expect(crew(home, [...reinstall, "--dry-run"])).toBe(0);
    expect(crew(home, reinstall)).toBe(0);
    expect(tracking(home)).toEqual(["a:auto:v1:true", "b:auto:v1:true"]);
    expect(tapKept(home, ownTap)).toBe(false);
    expect(intact()).toBe(true);
  });
}

test("C-INST-13m a refused run leaves an already-installed entry's markers where they were too", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  // `a` gains codex as a new agent, so it is reinstalled; `b` is already
  // installed in both agents, so it would move up front.
  const geminiFlags = [...CLAUDE, "--agent", "gemini-cli"];
  expect(crew(home, ["install", `file://${repo}//skills/a`, ...geminiFlags])).toBe(0);
  expect(crew(home, ["install", `file://${repo}//skills/b`, ...BOTH])).toBe(0);
  const bTap = tapOf(home, "b");
  const geminiCopy = join(geminiCliAdapter.userPath(), "a");
  chmodSync(geminiCopy, 0o555);
  const cap = captureStreams();
  try {
    expect(runCli(["install", `file://${repo}`, ...BOTH], { home, streams: cap.streams })).toBe(4);
  } finally {
    chmodSync(geminiCopy, 0o755);
  }
  expect(cap.stderr().replace(/\s+/g, " ")).toContain(geminiCopy);
  expect(tapOf(home, "b")).toBe(bTap);
  for (const root of [claudeCodeAdapter.userPath(), codexAdapter.userPath()])
    expect(markerTap(root, "b")).toBe(bTap);
});

test("C-INST-13m an already-installed entry whose copy can't follow its move refuses the run before any marker moves", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["install", `file://${repo}//skills/b`, ...BOTH])).toBe(0);
  const bTap = tapOf(home, "b");
  const codexCopy = join(codexAdapter.userPath(), "b");
  chmodSync(codexCopy, 0o555);
  const cap = captureStreams();
  try {
    expect(runCli(["install", `file://${repo}`, ...BOTH], { home, streams: cap.streams })).toBe(4);
  } finally {
    chmodSync(codexCopy, 0o755);
  }
  expect(cap.stderr().replace(/\s+/g, " ")).toContain(codexCopy);
  expect(markerTap(claudeCodeAdapter.userPath(), "b")).toBe(bTap);
  // A dry run says so too.
  chmodSync(codexCopy, 0o555);
  try {
    expect(crew(home, ["install", `file://${repo}`, ...BOTH, "--dry-run"])).toBe(4);
  } finally {
    chmodSync(codexCopy, 0o755);
  }
});
