/**
 * Removing a tracked tap's new child that one agent's folder can't take
 * (§10.1.1 step 2; C-UPD-18e): the child is removed from the agents it
 * was just installed into, so it is installed nowhere — but never from a
 * folder that held a crew marker naming it, one a safety check refused,
 * or the failing agent's own — and no later agent is written after the
 * first failure. Known gap: when another source's install of that name
 * holds the folder, the child writes over its bytes there; only its
 * removal is covered by C-UPD-18e.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Install `gamma` from another tap `other` into just `agent`; the install's exit code. */
function installOtherGamma(home: string, agent: string): number {
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "gamma", skillFrontmatter({ name: "gamma" }), "Other's.\n");
  run(home, ["tap", "add", other, "other"]);
  return run(home, ["install", "other/gamma", "--agent", agent]).code;
}

test("C-UPD-18e a failed child is removed from an agent it was just installed into", () => {
  const home = makeCrewHome();
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  // claude-code takes the child; gemini-cli then can't.
  whileReadOnly(agents.roots["gemini-cli"], () => expect(run(home, ["update"]).code).toBe(1));
  expect(existsSync(join(agents.roots["claude-code"], "gamma"))).toBe(false);
  expect(readState(home).installations.map((e) => e.name)).toEqual(["beta"]);
  expect(run(home, ["update"]).code).toBe(0);
  for (const root of Object.values(agents.roots))
    expect(existsSync(join(root, "gamma"))).toBe(true);
});

/** What a later agent's folder holds, planted at `dest`; the path whose bytes must survive. */
const LATER_AGENT_FAULTS: readonly (readonly [string, (dest: string) => string])[] = [
  [
    "a file where its folder goes",
    (dest) => {
      writeFileSync(dest, "a file\n");
      return dest;
    },
  ],
  [
    "a marker crew can't parse",
    (dest) => {
      mkdirSync(dest);
      writeFileSync(join(dest, ".crew.json"), "{not json");
      return join(dest, ".crew.json");
    },
  ],
];

for (const [what, plant] of LATER_AGENT_FAULTS) {
  test(`C-UPD-18e a failed child is removed when the later agent's folder holds ${what}`, () => {
    const home = makeCrewHome();
    const tapDir = installTrackedTap(home);
    makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
    const planted = plant(join(agents.roots["gemini-cli"], "gamma"));
    const before = readFileSync(planted, "utf8");
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).tap_reexpand_rows.map((row: { kind: string }) => row.kind)).toEqual(
      ["tap_error"],
    );
    expect(existsSync(join(agents.roots["claude-code"], "gamma"))).toBe(false);
    expect(readState(home).installations.map((e) => e.name)).toEqual(["beta"]);
    // The later agent's own folder is left as it was.
    expect(readFileSync(planted, "utf8")).toBe(before);
  });
}

test("C-UPD-18e a failed child that --force wrote over another name's install is installed nowhere", () => {
  const home = makeCrewHome();
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  // claude-code's `gamma` holds crew's marker for another name, which
  // only `--force` overrides (§7.3); gemini-cli then can't be written.
  const theirs = join(agents.roots["claude-code"], "gamma");
  mkdirSync(theirs);
  writeFileSync(join(theirs, ".crew.json"), JSON.stringify({ name: "other" }));
  whileReadOnly(agents.roots["gemini-cli"], () =>
    expect(run(home, ["update", "--force"]).code).toBe(1),
  );
  expect(existsSync(theirs)).toBe(false);
  expect(readState(home).installations.map((e) => e.name)).toEqual(["beta"]);
});

test("C-UPD-18e removing a failed child never deletes a folder that held a crew marker naming it", () => {
  const home = makeCrewHome();
  expect(installOtherGamma(home, "claude-code")).toBe(0);
  const tapDir = installTrackedTap(home);
  // Different bytes: claude-code's folder is written over, not up to date;
  // gemini-cli's copy is this child's to write, and fails.
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }), "Mine.\n");
  whileReadOnly(agents.roots["gemini-cli"], () => expect(run(home, ["update"]).code).toBe(1));
  expect(existsSync(join(agents.roots["claude-code"], "gamma", "SKILL.md"))).toBe(true);
});

test("C-UPD-18e removing a failed child never removes a folder a safety check refused", () => {
  const home = makeCrewHome();
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  // claude-code holds the user's own `gamma` (no marker): a safety check
  // refuses it. gemini-cli's folder then can't be written.
  const mine = join(agents.roots["claude-code"], "gamma");
  mkdirSync(mine);
  writeFileSync(join(mine, "mine.txt"), "the user's");
  whileReadOnly(agents.roots["gemini-cli"], () => expect(run(home, ["update"]).code).toBe(1));
  expect(readFileSync(join(mine, "mine.txt"), "utf8")).toBe("the user's");
});

test("C-UPD-18e a failed child that --force wrote over a user's folder is installed nowhere", () => {
  const home = makeCrewHome();
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  // `--force` lets the child replace claude-code's unmanaged `gamma`;
  // gemini-cli's folder then can't be written, so the child is removed.
  mkdirSync(join(agents.roots["claude-code"], "gamma"));
  whileReadOnly(agents.roots["gemini-cli"], () =>
    expect(run(home, ["update", "--force"]).code).toBe(1),
  );
  expect(existsSync(join(agents.roots["claude-code"], "gamma"))).toBe(false);
  expect(run(home, ["doctor"]).code).toBe(0);
});

test("C-UPD-18e after the first agent fails, no later agent is written", () => {
  const home = makeCrewHome();
  expect(installOtherGamma(home, "gemini-cli")).toBe(0);
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }), "Mine.\n");
  whileReadOnly(agents.roots["claude-code"], () => expect(run(home, ["update"]).code).toBe(1));
  const geminiGamma = readFileSync(join(agents.roots["gemini-cli"], "gamma", "SKILL.md"), "utf8");
  expect(geminiGamma).toContain("Other's.");
});
