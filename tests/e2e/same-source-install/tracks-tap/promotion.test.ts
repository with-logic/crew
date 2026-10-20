/**
 * Whole-tap tracking lands only where the user subscribed (§10.1.1,
 * §11.1; C-UPD-15, C-INST-13c, C-UPD-16b). A whole install that reaches
 * an entry already installed on its own sets `tracks_tap` on it — at that
 * install's scope and project root, and only when the entry sits on that
 * tap at that ref: one that keeps a broader registered tap, or sits at
 * another ref, would otherwise start following siblings — of the whole
 * registered repo, or at a revision — the user never asked for.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo, install } from "../helpers.ts";
import { addSiblingAndUpdate, crew, tracking } from "./helpers.ts";

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

test("C-UPD-15 installing the whole tap makes an entry installed on its own track it", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  expect(install(home, "mine/a").code).toBe(0);
  expect(install(home, "mine").code).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:-:true", "b:mine:-:true"]);

  expect(addSiblingAndUpdate(home, repo)).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:-:true", "b:mine:-:true", "c:mine:-:true"]);
});

test("C-UPD-15 a whole-tap install in one project subscribes only that project's entry", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  const [here, there] = [makeTempDir("crew-here-"), makeTempDir("crew-there-")];
  const inProject = (project: string, ref: string) =>
    crew(home, ["install", "--scope", "project", ref, "--agent", "claude-code"], project);
  expect(inProject(here, "mine/a")).toBe(0);
  expect(inProject(there, "mine/a")).toBe(0);
  expect(inProject(here, "mine")).toBe(0);
  const a = readState(home).installations.filter((e) => e.name === "a");
  const where = (root: string | undefined) => (root?.includes("crew-here-") ? "here" : "there");
  expect(a.map((e) => `${where(e.project_root)}:${e.tracks_tap === true}`).sort()).toEqual([
    "here:true",
    "there:false",
  ]);
});

for (const flags of [[], ["--force"]]) {
  const how = flags.join(" ") || "no flags";
  test(`C-INST-13c an entry that keeps a registered tap isn't subscribed to it (${how})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
    expect(install(home, "mine/a").code).toBe(0);
    // The whole of a one-skill source at the same folder: `a` stays on
    // `mine`, the user's own tap, which this install never asked for.
    expect(
      crew(home, ["install", `file://${repo}//skills/a`, "--agent", "claude-code", ...flags]),
    ).toBe(0);
    expect(tracking(home)).toEqual(["a:mine:-:false"]);

    expect(addSiblingAndUpdate(home, repo)).toBe(0);
    expect(tracking(home)).toEqual(["a:mine:-:false"]);
  });
}

test("C-UPD-16b a whole-tap install at a tag doesn't subscribe the default-branch entry", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  expect(install(home, "mine/a").code).toBe(0);
  tagRepo(repo, "v1");
  // Same commit, so `a` is already installed — but it follows the
  // default branch, and this install subscribes to `v1`.
  expect(install(home, "mine@v1").code).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:-:false", "b:mine:v1:true"]);

  expect(addSiblingAndUpdate(home, repo)).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:-:false", "b:mine:v1:true"]);
});
