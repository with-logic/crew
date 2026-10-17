/**
 * A reinstall that moves an entry, failing on one targeted agent and
 * succeeding on another (§5.4, §15; C-INST-13n). The entry moves, and the
 * failed copy — reported for that agent — follows where crew can read and
 * write its marker (a copy with local edits keeps its bytes but moves);
 * where it can't, the marker keeps naming the old tap, which is kept
 * rather than collected, so nothing names a tap that's gone.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo } from "../helpers.ts";
import { crew, markerTap, redirectAgents, tapOf } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

const CLAUDE = ["--agent", "claude-code"];
const BOTH = [...CLAUDE, "--agent", "codex"];

/** `a` installed into `first`, then the repo tagged `v1`; the home, repo, and `a`'s own tap. */
function setUp(first: readonly string[]): { home: string; repo: string; ownTap: string } {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  crew(home, ["install", `file://${repo}//skills/a`, ...first]);
  tagRepo(repo, "v1");
  return { home, repo, ownTap: tapOf(home, "a") };
}

/** Whether a config tap of that name remains. */
function tapKept(home: string, name: string): boolean {
  return readConfig(home).taps.some((t) => t.name === name);
}

for (const [label, first, run] of [
  ["one of two targeted agents", BOTH, [...BOTH, "--force"]],
  ["one found up to date beside a new agent", ["--agent", "codex"], BOTH],
] as const) {
  test(`C-INST-13n a copy crew can't write keeps the old tap, which is kept (${label})`, () => {
    const { home, repo, ownTap } = setUp(first);
    const copy = join(codexAdapter.userPath(), "a");
    chmodSync(copy, 0o555);
    let after: string;
    try {
      expect(crew(home, ["install", `file://${repo}@v1`, ...run])).toBe(0);
      after = markerTap(codexAdapter.userPath(), "a");
    } finally {
      chmodSync(copy, 0o755);
    }
    expect(tapOf(home, "a")).not.toBe(ownTap);
    expect(markerTap(claudeCodeAdapter.userPath(), "a")).toBe(tapOf(home, "a"));
    expect(after).toBe(ownTap);
    expect(tapKept(home, ownTap)).toBe(true);
  });
}

test("C-INST-13n a copy whose marker crew can't parse is passed over; the move goes on", () => {
  const { home, repo, ownTap } = setUp(BOTH);
  const markerPath = join(codexAdapter.userPath(), "a", ".crew.json");
  writeFileSync(markerPath, "{not json");
  expect(crew(home, ["install", `file://${repo}@v1`, ...BOTH, "--force"])).toBe(0);
  expect(readFileSync(markerPath, "utf8")).toBe("{not json");
  expect(markerTap(claudeCodeAdapter.userPath(), "a")).toBe(tapOf(home, "a"));
  expect(tapKept(home, ownTap)).toBe(false);
});

test("C-INST-13n a copy with local edits keeps its bytes, and its marker follows the move", () => {
  const { home, repo, ownTap } = setUp(BOTH);
  const edited = join(codexAdapter.userPath(), "a", "SKILL.md");
  writeFileSync(edited, `${readFileSync(edited, "utf8")}\nMy own note.\n`);
  // A change to `a` upstream, so it is reinstalled — and codex's edited
  // copy refused.
  makeSkill(join(repo, "skills"), "a", skillFrontmatter({ name: "a" }), "Changed.\n");
  commitAll(repo, "change a");
  tagRepo(repo, "v2");
  expect(crew(home, ["install", `file://${repo}@v2`, ...BOTH])).toBe(0);
  expect(readFileSync(edited, "utf8")).toContain("My own note.");
  expect(readFileSync(join(claudeCodeAdapter.userPath(), "a", "SKILL.md"), "utf8")).toContain(
    "Changed.",
  );
  expect(tapOf(home, "a")).not.toBe(ownTap);
  expect(markerTap(codexAdapter.userPath(), "a")).toBe(tapOf(home, "a"));
  expect(tapKept(home, ownTap)).toBe(false);
});
