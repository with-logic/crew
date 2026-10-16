/**
 * A tracked tap's new child that one agent's folder can't take (§10.1.1
 * step 2; C-UPD-18e): the child is reported as failed, not recorded, and
 * removed from the agent that did take it, so the next run installs it
 * into both rather than leaving one agent without it for good.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
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
