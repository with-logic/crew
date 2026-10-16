/**
 * An update one agent's folder can't take (§10.1, §10.1.1 step 2;
 * C-UPD-16c, C-UPD-18e): a tracked tap's new child is reported as failed
 * and not recorded, so the next run installs it into both agents; an
 * existing skill's update keeps its entry and reads as failed.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { run } from "../helpers.ts";
import { installTrackedTap, redirectAgents, whileReadOnly } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

test("C-UPD-18e a new child one agent's folder can't take is retried, not recorded without it", () => {
  const home = makeCrewHome();
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  whileReadOnly(agents.roots["claude-code"], () => {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).tap_reexpand_rows;
    expect([row.name, row.kind, row.error.code]).toEqual(["gamma", "tap_error", "EACCES"]);
    expect(readState(home).installations.map((e) => e.name)).toEqual(["beta"]);
    // Installed nowhere, so nothing is left that state doesn't know.
    expect(existsSync(join(agents.roots["gemini-cli"], "gamma"))).toBe(false);
  });

  expect(run(home, ["update"]).code).toBe(0);
  const gamma = readState(home).installations.find((e) => e.name === "gamma");
  expect(gamma?.agents.slice().sort()).toEqual(["claude-code", "gemini-cli"]);
  for (const root of Object.values(agents.roots))
    expect(existsSync(join(root, "gamma"))).toBe(true);
});

test("C-UPD-16c one of two agents failing an update keeps the entry, and reads as failed", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  const before = readState(home).installations[0]!.content_hash;
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
  whileReadOnly(agents.roots["claude-code"], () => {
    const r = run(home, ["update"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/\[fail\] demo\s+failed\s+claude-code: EACCES/);
    expect(r.stdout).not.toContain("gemini-cli: ");
    expect(readState(home).installations[0]!.content_hash).toBe(before);
  });
});
