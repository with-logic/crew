/**
 * A whole install that reinstalls an entry tracking an auto tap of its
 * own (§5.4, §11.1; C-UPD-16b). The entry ends at the install's ref, which
 * the install subscribes to, so it moves onto the install's tap and
 * tracks it there — whether a new commit, `--force`, or a new agent made
 * the reinstall, at the same ref or another — and its own tap, left empty,
 * is collected. An entry on its registered tap stays there, recorded at
 * the install's ref, tracking. (Failures and markers: `./failures.test.ts`.)
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
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
import { addSiblingAndUpdate, crew, markerTap, tapOf, tracking } from "./helpers.ts";

type Redirect = { userPath: () => string; detect: () => boolean };
let originals: (readonly [Redirect, Redirect])[] = [];
beforeEach(() => {
  originals = [];
  // Every install names its agents, so codex takes part only where a test
  // names it.
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
    if (edit) {
      makeSkill(join(repo, "skills"), "a", skillFrontmatter({ name: "a" }), "Edited.\n");
      commitAll(repo, "edit a");
    }
    tagRepo(repo, "v1");
    expect(crew(home, ["install", `file://${repo}${at}`, ...flags])).toBe(0);
    expect(tapOf(home, "a")).not.toBe(ownTap);
    const ref = at === "" ? "-" : "v1";
    expect(tracking(home)).toEqual([`a:auto:${ref}:true`, `b:auto:${ref}:true`]);
    // Its own one-skill tap, left with nothing, is collected; every marker
    // follows, an agent the run found up to date included.
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(false);
    expect(markerTap(claudeCodeAdapter.userPath(), "a")).toBe(tapOf(home, "a"));
  });
}

test("C-UPD-16b a whole install at a tag that reinstalls an entry on its registered tap records it at the tag, tracking", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  expect(install(home, "mine/a").code).toBe(0);
  tagRepo(repo, "v1");
  expect(crew(home, ["install", "mine@v1", ...CLAUDE, "--force"])).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:v1:true", "b:mine:v1:true"]);

  expect(addSiblingAndUpdate(home, repo)).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:v1:true", "b:mine:v1:true"]);
});
