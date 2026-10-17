/**
 * Auto-tap collection and the folders state entries' agents install into
 * (§16.5; C-UPD-17): there, a folder crew can't search might hold a marker
 * naming any tap, so nothing is collected, even when an entry that doesn't
 * install into a shared folder reaches it first. Once crew can search it,
 * the tap goes. Any other folder crew can't search names nothing, in an
 * agent another entry uses too.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../../../src/agents/gemini-cli.ts";
import { readState } from "../../../../../src/state/load.ts";
import { makeCrewHome } from "../../../../helpers/env.ts";
import { makeTempDir } from "../../../../helpers/fixtures.ts";
import { buildRepo } from "../../helpers.ts";
import { BOTH, CLAUDE, crew, redirectAgents, tapKept, tapOf } from "../helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/**
 * Install x, from its own repo, and z, beside y, in claude-code; y in
 * `yAgents`. Returns x's tap; throws when an install fails.
 */
function installXYZ(home: string, yAgents: readonly string[]): string {
  const [repoX, repoY] = [buildRepo(["x"]), buildRepo(["y", "z"])];
  const installs = [
    ["install", `file://${repoX}//skills/x`, ...CLAUDE],
    ["install", `file://${repoY}//skills/y`, ...yAgents],
    ["install", `file://${repoY}//skills/z`, ...CLAUDE],
  ];
  for (const args of installs) {
    if (crew(home, args) !== 0) throw new Error(`crew ${args.join(" ")} failed`);
  }
  return tapOf(home, "x");
}

/**
 * Uninstall x while `folder` can't be searched, then z once it can: each
 * run's exit code, and whether x's tap was kept after it.
 */
function uninstallWhileUnsearchable(home: string, xTap: string, folder: string) {
  chmodSync(folder, 0o000);
  let hiddenExit: number;
  let keptWhileHidden: boolean;
  try {
    hiddenExit = crew(home, ["uninstall", "x", "--yes"]);
    keptWhileHidden = tapKept(home, xTap);
  } finally {
    chmodSync(folder, 0o755);
  }
  // Any later collection takes what nothing names any more.
  const laterExit = crew(home, ["uninstall", "z", "--yes"]);
  return { hiddenExit, keptWhileHidden, laterExit, keptAfter: tapKept(home, xTap) };
}

const HELD = { hiddenExit: 0, keptWhileHidden: true, laterExit: 0, keptAfter: false };

test("C-UPD-17 a folder crew can't search, in an entry's own agent, stops collection", () => {
  const home = makeCrewHome();
  const xTap = installXYZ(home, BOTH);
  const folder = join(codexAdapter.userPath(), "y");
  expect(uninstallWhileUnsearchable(home, xTap, folder)).toEqual(HELD);
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
  const ys = readState(home).installations.filter((e) => e.name === "y");
  expect(ys.map((e) => `${e.scope}:${e.agents.join(",")}`)).toEqual([
    "project:claude-code",
    "user:codex",
  ]);
  const xTap = tapOf(home, "x");
  const folder = join(codexAdapter.userPath(), "y");
  expect(uninstallWhileUnsearchable(home, xTap, folder)).toEqual(HELD);
});

test("C-UPD-17 a folder crew can't search names nothing where no entry's agent installs into it, in an agent another entry uses", () => {
  const home = makeCrewHome();
  const xTap = installXYZ(home, [...CLAUDE, "--agent", "gemini-cli"]);
  // y lists gemini-cli; z doesn't, so gemini's z folder is no entry's.
  const folder = join(geminiCliAdapter.userPath(), "z");
  mkdirSync(folder);
  expect(uninstallWhileUnsearchable(home, xTap, folder)).toEqual({
    ...HELD,
    keptWhileHidden: false,
  });
});
