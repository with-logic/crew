/**
 * A tracked tap's new child that one agent's folder can't take (§10.1.1
 * step 2; C-UPD-18e): the child is reported as failed, not recorded, and
 * removed from the agent that did take it, so the next run installs it
 * into both rather than leaving one agent without it for good.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { run } from "./helpers.ts";

type Redirectable = { userPath: () => string; detect: () => boolean };
const ADAPTERS: readonly (readonly [string, Redirectable])[] = [
  ["claude-code", claudeCodeAdapter],
  ["gemini-cli", geminiCliAdapter],
];

let roots: Record<string, string> = {};
let saved: (readonly [Redirectable, Redirectable])[] = [];
beforeEach(() => {
  roots = {};
  saved = ADAPTERS.map(([, a]) => [a, { userPath: a.userPath, detect: a.detect }] as const);
  for (const [name, adapter] of ADAPTERS) {
    const root = makeTempDir(`crew-${name}-`);
    roots[name] = root;
    adapter.userPath = () => root;
    adapter.detect = () => true;
  }
});
afterEach(() => {
  for (const [adapter, original] of saved) Object.assign(adapter, original);
});

test("C-UPD-18e a new child one agent's folder can't take is retried, not recorded without it", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  const claude = roots["claude-code"]!;
  chmodSync(claude, 0o555);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).tap_reexpand_rows;
    expect([row.name, row.kind, row.error.code]).toEqual(["gamma", "tap_error", "EACCES"]);
    expect(readState(home).installations.map((e) => e.name)).toEqual(["beta"]);
    // Installed nowhere, so nothing is left that state doesn't know.
    expect(existsSync(join(roots["gemini-cli"]!, "gamma"))).toBe(false);
  } finally {
    chmodSync(claude, 0o755);
  }

  expect(run(home, ["update"]).code).toBe(0);
  const gamma = readState(home).installations.find((e) => e.name === "gamma");
  expect(gamma?.agents.slice().sort()).toEqual(["claude-code", "gemini-cli"]);
  for (const root of Object.values(roots)) expect(existsSync(join(root, "gamma"))).toBe(true);
});

test("C-UPD-18e undoing a failed child never removes another skill's install of that name", () => {
  const home = makeCrewHome();
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "gamma", skillFrontmatter({ name: "gamma" }), "Other's.\n");
  expect(run(home, ["tap", "add", other, "other"]).code).toBe(0);
  // Only in claude-code, which is installed first and finds it already
  // there; gemini-cli's copy is this child's to write, and fails.
  expect(run(home, ["install", "other/gamma", "--agent", "claude-code"]).code).toBe(0);
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }), "Other's.\n");
  const gemini = roots["gemini-cli"]!;
  chmodSync(gemini, 0o555);
  try {
    expect(run(home, ["update"]).code).toBe(1);
  } finally {
    chmodSync(gemini, 0o755);
  }
  expect(existsSync(join(roots["claude-code"]!, "gamma", "SKILL.md"))).toBe(true);
  expect(run(home, ["doctor"]).code).toBe(0);
});

test("C-UPD-16c one of two agents failing an update keeps the entry, and reads as failed", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  const before = readState(home).installations[0]!.content_hash;
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
  const claude = roots["claude-code"]!;
  chmodSync(claude, 0o555);
  try {
    const r = run(home, ["update"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/\[fail\] demo\s+failed\s+claude-code: EACCES/);
    expect(r.stdout).not.toContain("gemini-cli: ");
    expect(readState(home).installations[0]!.content_hash).toBe(before);
  } finally {
    chmodSync(claude, 0o755);
  }
});

test("C-UPD-18e undoing a failed child never removes a folder the user owns", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  // claude-code, installed first, holds the user's own `gamma` (no marker):
  // a safety check refuses it. gemini-cli's folder then can't be written.
  const mine = join(roots["claude-code"]!, "gamma");
  mkdirSync(mine);
  writeFileSync(join(mine, "mine.txt"), "the user's");
  const gemini = roots["gemini-cli"]!;
  chmodSync(gemini, 0o555);
  try {
    expect(run(home, ["update"]).code).toBe(1);
  } finally {
    chmodSync(gemini, 0o755);
  }
  expect(readFileSync(join(mine, "mine.txt"), "utf8")).toBe("the user's");
});
