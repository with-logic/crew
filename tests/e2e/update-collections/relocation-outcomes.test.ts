/**
 * What a relocation leaves when the update doesn't take (PRD §10.1,
 * C-UPD-16c, C-UPD-37): the new path is recorded only by the entry's own
 * successful update, with its marker and commit. One whose update fails
 * keeps its recorded path, entry and marker as they were, and the next
 * run moves them; a moved skill whose content didn't change is
 * reinstalled, so its marker follows instead of drifting from state.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { readJson } from "../../../src/util/json.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
import { buildNamespacedTap, bump, freshHome, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let ccRoot = "";
beforeEach(() => {
  ccRoot = makeTempDir("upd-coll-r-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

/** Move `mover` from namespace `alpha` to `beta` in `repo`'s working tree. */
function moveMover(repo: string): void {
  mkdirSync(join(repo, "skills", "beta"));
  renameSync(join(repo, "skills", "alpha", "mover"), join(repo, "skills", "beta", "mover"));
}

/** `mover`'s path as state records it, then as its marker does. */
function recordedPaths(home: string): string[] {
  const entry = readState(home).installations.find((e) => e.name === "mover");
  const marker = readJson<Marker>(join(ccRoot, "mover", ".crew.json"));
  return [entry?.source.path ?? "", marker.path];
}

/** The codes of `crew doctor`'s findings. */
function doctorCodes(home: string): string[] {
  const findings = JSON.parse(run(home, ["doctor", "--json"]).out).findings as { code: string }[];
  return findings.map((f) => f.code);
}

test("C-UPD-16c C-UPD-37 a moved skill whose update fails keeps its entry and path; a retry moves them", () => {
  const home = freshHome();
  const repo = buildNamespacedTap("upd-coll-r1-", { alpha: ["mover"] });
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  expect(run(home, ["install", "acme"]).code).toBe(0);
  const before = readState(home).installations.find((e) => e.name === "mover");
  moveMover(repo);
  commitAll(repo, "move mover to beta");
  bump(repo, join("skills", "beta"), "mover", "mover-v2");

  chmodSync(ccRoot, 0o555);
  try {
    expect(run(home, ["update", "mover"]).code).toBe(1);
  } finally {
    chmodSync(ccRoot, 0o755);
  }
  expect(readState(home).installations.find((e) => e.name === "mover")).toEqual(before);
  expect(recordedPaths(home)).toEqual(["skills/alpha/mover", "skills/alpha/mover"]);
  expect(doctorCodes(home)).toEqual([]);

  expect(run(home, ["update", "mover"]).code).toBe(0);
  expect(recordedPaths(home)).toEqual(["skills/beta/mover", "skills/beta/mover"]);
});

test("C-UPD-37 a path tap's skill moved with its content unchanged is reinstalled; doctor finds nothing", () => {
  const home = freshHome();
  const tapDir = buildNamespacedTap("upd-coll-r2-", { alpha: ["mover"] });
  expect(run(home, ["tap", "add", tapDir, "acme"]).code).toBe(0);
  expect(run(home, ["install", "acme"]).code).toBe(0);
  moveMover(tapDir);

  const j = run(home, ["update", "--json"]).json();
  expect(j.rows.map((r) => `${r.name}:${r.outcome.kind}`)).toEqual(["mover:updated"]);
  expect(recordedPaths(home)).toEqual(["skills/beta/mover", "skills/beta/mover"]);
  expect(doctorCodes(home)).toEqual([]);
  // Settled: the next run has nothing to move.
  const again = run(home, ["update", "--json"]).json();
  expect(again.rows.map((r) => r.outcome.kind)).toEqual(["up_to_date"]);
});
