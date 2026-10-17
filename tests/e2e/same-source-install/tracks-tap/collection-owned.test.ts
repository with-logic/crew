/**
 * Auto-tap collection and the folders entries' agents install into
 * (§16.5; C-UPD-17): there, a folder crew can't search might hold a marker
 * naming any tap, so nothing is collected — whichever entry reaches a
 * folder two entries share first. Once crew can search it, the tap goes.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { buildRepo } from "../helpers.ts";
import { BOTH, CLAUDE, crew, redirectAgents, tapKept, tapOf } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/**
 * Uninstall x while `folder` can't be searched, then z once it can: each
 * run's exit code, and whether x's tap was kept after it.
 */
function collectAround(home: string, xTap: string, folder: string): (number | boolean)[] {
  chmodSync(folder, 0o000);
  const seen: (number | boolean)[] = [];
  try {
    seen.push(crew(home, ["uninstall", "x", "--yes"]), tapKept(home, xTap));
  } finally {
    chmodSync(folder, 0o755);
  }
  // Any later collection takes what nothing names any more.
  seen.push(crew(home, ["uninstall", "z", "--yes"]), tapKept(home, xTap));
  return seen;
}

test("C-UPD-17 a folder crew can't search, in an entry's own agent, stops collection", () => {
  const home = makeCrewHome();
  const [repoX, repoY] = [buildRepo(["x"]), buildRepo(["y", "z"])];
  expect(crew(home, ["install", `file://${repoX}//skills/x`, ...CLAUDE])).toBe(0);
  expect(crew(home, ["install", `file://${repoY}//skills/y`, ...BOTH])).toBe(0);
  expect(crew(home, ["install", `file://${repoY}//skills/z`, ...CLAUDE])).toBe(0);
  const xTap = tapOf(home, "x");
  const folder = join(codexAdapter.userPath(), "y");
  expect(collectAround(home, xTap, folder)).toEqual([0, true, 0, false]);
});

test("C-UPD-17 a shared folder one entry installs into stops collection, even reached first by another", () => {
  const home = makeCrewHome();
  const project = makeTempDir("crew-project-");
  // codex's user folder is the project's, as at a project root at the
  // user's home: user y's codex copy is project y's codex folder.
  codexAdapter.userPath = () => codexAdapter.projectPath(project);
  const [repoX, repoY] = [buildRepo(["x"]), buildRepo(["y", "z"])];
  expect(crew(home, ["install", `file://${repoX}//skills/x`, ...CLAUDE])).toBe(0);
  const yProject = ["install", `file://${repoY}//skills/y`, "--scope", "project", ...CLAUDE];
  expect(crew(home, yProject, project)).toBe(0);
  expect(crew(home, ["install", `file://${repoY}//skills/y`, "--agent", "codex"])).toBe(0);
  expect(crew(home, ["install", `file://${repoY}//skills/z`, ...CLAUDE])).toBe(0);
  // Project y, which doesn't list codex, comes first in state.
  const order = readState(home).installations.map((e) => `${e.name}:${e.scope}`);
  expect(order.indexOf("y:project")).toBeLessThan(order.indexOf("y:user"));
  const xTap = tapOf(home, "x");
  const folder = join(codexAdapter.userPath(), "y");
  expect(collectAround(home, xTap, folder)).toEqual([0, true, 0, false]);
});
