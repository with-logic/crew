/**
 * An install says when it changes an entry's tap or tracking (§5.4,
 * §11.1; C-INST-13o): a move, a whole-tap install that starts an entry
 * tracking its tap, and a reinstall at another ref that stops it — in
 * human output and in `--json` `attribution_changes`, the dry run
 * included. An install that changes neither reports nothing.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeTempDir, tagRepo } from "../../helpers/fixtures.ts";
import { buildRepo } from "./helpers.ts";

let ccOriginal: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  const root = makeTempDir("crew-cc-");
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => root;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

/** `crew`, its installs in claude-code only: its exit code and stdout. */
function crew(home: string, args: readonly string[]): { code: number; out: string } {
  const cap = captureStreams();
  const agent = args[0] === "install" ? ["--agent", "claude-code"] : [];
  const code = runCli([...args, ...agent], { home, streams: cap.streams });
  return { code, out: cap.stdout() };
}

/** `crew` for a test's setup; throws when it fails. */
function must(home: string, args: readonly string[]): void {
  if (crew(home, args).code !== 0) throw new Error(`crew ${args.join(" ")} failed`);
}

/** `crew install … --json`'s `attribution_changes`. */
function changesOf(home: string, args: readonly string[]): unknown {
  const { out } = crew(home, ["install", ...args, "--json"]);
  return (JSON.parse(out) as { attribution_changes: unknown }).attribution_changes;
}

/** The tap `name`'s entry is attributed to. */
function tapOf(home: string, name: string): string {
  return readState(home).installations.find((e) => e.name === name)!.source.tap;
}

/** A home with `a` installed alone from registered tap `mine`; and the repo. */
function soloOnMine(): { home: string; repo: string } {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  must(home, ["tap", "add", `file://${repo}`, "mine"]);
  must(home, ["install", "mine/a"]);
  return { home, repo };
}

/** A home tracking all of `mine`, whose `v1` tag sits a commit behind its default branch. */
function trackingMine(): string {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  tagRepo(repo, "v1");
  writeFileSync(join(repo, "skills", "a", "notes.md"), "later\n");
  commitAll(repo, "after v1");
  must(home, ["tap", "add", `file://${repo}`, "mine"]);
  must(home, ["install", "mine"]);
  return home;
}

test("C-INST-13o a move onto the whole repo says where the entry went", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["install", `file://${repo}//skills/a`]).code).toBe(0);
  const narrow = tapOf(home, "a");

  const preview = crew(home, ["install", `file://${repo}`, "--dry-run"]);
  expect(preview.out).toContain(`would move from ${narrow} to `);
  // A one-skill install already tracked its tap; the move carries that.
  expect(preview.out).not.toMatch(/track/);
  const previewed = changesOf(home, [`file://${repo}`, "--dry-run"]);
  expect(tapOf(home, "a")).toBe(narrow);

  const made = changesOf(home, [`file://${repo}`]);
  const broad = tapOf(home, "a");
  expect(made).toEqual([{ name: "a", scope: "user", tap: broad, moved_from: narrow }]);
  expect(previewed).toEqual(made);
});

test("C-INST-13o a whole-tap install that starts an entry tracking says so", () => {
  const shown = soloOnMine();
  expect(crew(shown.home, ["install", "mine", "--dry-run"]).out).toContain(
    "would track mine: updates install its new skills",
  );
  const human = crew(shown.home, ["install", "mine"]);
  expect(human.out).toContain("now tracks mine: updates install its new skills");
  expect(human.out).not.toContain("moved from");

  // `b` is new: a fresh install is no change.
  expect(changesOf(soloOnMine().home, ["mine"])).toEqual([
    { name: "a", scope: "user", tap: "mine", tracks_tap: true },
  ]);
});

test("C-INST-13o a reinstall at another ref that stops an entry tracking says so", () => {
  const home = trackingMine();
  expect(crew(home, ["install", "mine/a@v1", "--dry-run"]).out).toContain(
    "would stop tracking mine: updates won't install its new skills",
  );
  expect(changesOf(home, ["mine/a@v1", "--dry-run"])).toEqual([
    { name: "a", scope: "user", tap: "mine", tracks_tap: false },
  ]);
  const pinned = crew(home, ["install", "mine/a@v1"]);
  expect(pinned.code).toBe(0);
  expect(pinned.out).toContain("no longer tracks mine: updates won't install its new skills");
  expect(readState(home).installations.find((e) => e.name === "a")?.tracks_tap).toBeUndefined();
});

test("C-INST-13o an install that changes neither tap nor tracking reports no change", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a"]);
  expect(crew(home, ["install", `file://${repo}`]).code).toBe(0);
  const again = crew(home, ["install", `file://${repo}`, "--force"]);
  expect(again.code).toBe(0);
  expect(again.out).not.toMatch(/moved from|track/);
  expect(changesOf(home, [`file://${repo}`, "--force"])).toEqual([]);
});
