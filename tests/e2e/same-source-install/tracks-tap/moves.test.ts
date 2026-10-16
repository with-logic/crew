/**
 * A subscription follows an entry only where the user subscribed (§5.4,
 * §11.1; C-INST-13h, C-UPD-16b), for an entry the install finds already
 * installed. One that tracks its auto tap moves onto another tap covering
 * it only when that install subscribes to the other tap at the entry's
 * ref, which the move keeps: moved anywhere else, it would follow
 * siblings the user never asked for. An install that reinstalls a
 * tracking entry alone at another ref records it there without
 * `tracks_tap`. (Reinstalls by a whole install: `./reinstalls.test.ts`.)
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo, install } from "../helpers.ts";
import { addSiblingAndUpdate, crew, tapOf, tracking } from "./helpers.ts";

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

test("C-INST-13h a tracking entry isn't carried onto a broader tap by one skill's install", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  // `a` alone, as a whole source: it tracks a one-skill auto tap.
  expect(install(home, `file://${repo}//skills/a`).code).toBe(0);
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  expect(install(home, "mine/a").code).toBe(0);
  expect(tracking(home)).toEqual(["a:auto:-:true"]);

  expect(addSiblingAndUpdate(home, repo)).toBe(0);
  expect(tracking(home)).toEqual(["a:auto:-:true"]);
});

test("C-UPD-16b a tracking entry isn't moved onto the tap of a whole install at another ref that finds it installed", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(install(home, `file://${repo}//skills/a`).code).toBe(0);
  const ownTap = tapOf(home, "a");
  expect(ownTap).toBeString();
  tagRepo(repo, "v1");
  // The whole repo at `v1`, on the same commit: `a`, already installed,
  // keeps its own tap and the default branch.
  expect(install(home, `file://${repo}@v1`).code).toBe(0);
  expect(tapOf(home, "a")).toBe(ownTap);
  expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:v1:true"]);

  expect(addSiblingAndUpdate(home, repo)).toBe(0);
  expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:v1:true"]);
});

test("C-UPD-16b an entry moved by a whole install at a tag doesn't take that install's subscription", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["solo", "keep"]);
  // `solo` on its own through the `skills/` auto tap, which `keep` holds.
  expect(install(home, `file://${repo}//skills`).code).toBe(0);
  const narrowTap = readState(home).installations[0]!.source.tap;
  expect(crew(home, ["uninstall", "solo", "--yes"])).toBe(0);
  expect(install(home, `${narrowTap}/solo`).code).toBe(0);
  tagRepo(repo, "v1");
  // The whole repo at `v1`, on the same commit: `solo` moves onto the
  // repo's tap but stays on the default branch, so it doesn't follow it.
  expect(install(home, `file://${repo}@v1`).code).toBe(0);
  const solo = readState(home).installations.find((e) => e.name === "solo");
  expect([solo?.source.tap === narrowTap, solo?.ref, solo?.tracks_tap ?? false]).toEqual([
    false,
    null,
    false,
  ]);
});

test("C-UPD-16b one skill installed alone at a tag leaves the subscription behind", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b", "d"]);
  tagRepo(repo, "v1");
  // `d` is left only at `v1`.
  rmSync(join(repo, "skills", "d"), { recursive: true });
  commitAll(repo, "drop d");
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  expect(install(home, "mine").code).toBe(0);
  expect(install(home, "mine/a@v1").code).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:v1:false", "b:mine:-:true"]);

  expect(crew(home, ["update"])).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:v1:false", "b:mine:-:true"]);
});

test("C-UPD-16b a whole install at a tag that reinstalls an entry on its registered tap moves it to the tag, tracking", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  expect(crew(home, ["tap", "add", `file://${repo}`, "mine"])).toBe(0);
  expect(install(home, "mine/a").code).toBe(0);
  tagRepo(repo, "v1");
  expect(crew(home, ["install", "mine@v1", "--agent", "claude-code", "--force"])).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:v1:true", "b:mine:v1:true"]);

  expect(addSiblingAndUpdate(home, repo)).toBe(0);
  expect(tracking(home)).toEqual(["a:mine:v1:true", "b:mine:v1:true"]);
});
