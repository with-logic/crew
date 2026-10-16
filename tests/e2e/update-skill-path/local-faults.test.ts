/**
 * `crew update` against local faults (§10.1, §10.1.1, §13; C-UPD-16c,
 * C-UPD-18e, C-UPD-40): a skill holding a file crew can't read, a path
 * crew can't search, and a tracked tap's new child crew can't copy all
 * fail as `source_unreachable` — not an upstream deletion, and not a
 * usage error that stops the rest of the run. An agent folder crew can't
 * write fails the skill's update, which keeps its entry and is retried;
 * a new child no agent could take is reported, not dropped, while one a
 * safety check refuses is left out. A path tap's skill folder that
 * became a looping link is gone.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { run } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-UPD-40 a file crew can't read while staging fails the update as source_unreachable", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  const skill = makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
  writeFileSync(join(skill, "notes.txt"), "private\n");
  chmodSync(join(skill, "notes.txt"), 0o000);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).rows;
    expect([row.name, row.outcome.kind, row.outcome.error.code]).toEqual([
      "demo",
      "failed",
      "source_unreachable",
    ]);
  } finally {
    chmodSync(join(skill, "notes.txt"), 0o644);
  }
});

test("C-UPD-40 a path tap's skill folder that became a looping link is source_gone", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  const skill = makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  rmSync(skill, { recursive: true });
  symlinkSync("demo", skill);

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  expect(
    JSON.parse(r.stdout).rows.map((row: { outcome: { kind: string } }) => row.outcome.kind),
  ).toEqual(["source_gone"]);
});

test("C-UPD-40 a skill installed by path under a folder crew can't search fails, not gone", () => {
  const home = makeCrewHome();
  const outer = makeTempDir();
  makeSkill(join(outer, "pt"), "demo", skillFrontmatter({ name: "demo" }));
  expect(run(home, ["install", join(outer, "pt", "demo")]).code).toBe(0);
  chmodSync(outer, 0o000);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).rows;
    expect([row.outcome.kind, row.outcome.error.code]).toEqual(["failed", "source_unreachable"]);
  } finally {
    chmodSync(outer, 0o755);
  }
});

test("C-UPD-18e C-UPD-40 a tracked tap's new child crew can't copy fails alone; the rest update", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }), "Edited.\n");
  const alpha = makeSkill(join(tapDir, "skills"), "alpha", skillFrontmatter({ name: "alpha" }));
  writeFileSync(join(alpha, "extra.txt"), "private\n");
  chmodSync(join(alpha, "extra.txt"), 0o000);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(
      out.rows.map(
        (row: { name: string; outcome: { kind: string } }) => `${row.name}:${row.outcome.kind}`,
      ),
    ).toEqual(["beta:updated"]);
    const [added] = out.tap_reexpand_rows;
    expect([added.name, added.kind, added.error.code]).toEqual([
      "alpha",
      "tap_error",
      "source_unreachable",
    ]);
  } finally {
    chmodSync(join(alpha, "extra.txt"), 0o644);
  }
});

test("C-UPD-16c an agent folder crew can't write fails the update, and the next run retries", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  const before = readState(home).installations[0]!.content_hash;
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
  chmodSync(claude.userRoot, 0o555);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [target] = JSON.parse(r.stdout).rows[0].outcome.per_target;
    expect([target.kind, target.error.code]).toEqual(["failed", "EACCES"]);
    const human = run(home, ["update"]).stdout;
    expect(human).toMatch(/\[fail\] demo\s+failed\s+claude-code: EACCES/);
    expect(human).toContain("1 failure");
    expect(human).not.toContain("updated");
    expect(readState(home).installations[0]!.content_hash).toBe(before);
  } finally {
    chmodSync(claude.userRoot, 0o755);
  }
  expect(run(home, ["update"]).code).toBe(0);
  expect(readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8")).toContain("Edited.");
});

test("C-UPD-18e a tracked tap's new child no agent could take is reported, not dropped", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  chmodSync(claude.userRoot, 0o555);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [added] = JSON.parse(r.stdout).tap_reexpand_rows;
    expect([added.name, added.kind, added.error.code]).toEqual(["gamma", "tap_error", "EACCES"]);
  } finally {
    chmodSync(claude.userRoot, 0o755);
  }
});

test("C-UPD-18e a new child an untracked folder blocks is left out, as an install leaves it", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  // The user's own folder of that name, which crew didn't install (§7.3).
  makeSkill(claude.userRoot, "gamma", skillFrontmatter({ name: "gamma" }), "Mine.\n");

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout).tap_reexpand_rows).toEqual([]);
  expect(readFileSync(join(claude.userRoot, "gamma", "SKILL.md"), "utf8")).toContain("Mine.");
});
