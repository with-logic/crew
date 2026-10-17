/**
 * Auto-tap collection after a move left a copy behind (§16.5; C-UPD-17,
 * C-INST-13n): a tap a crew marker at a state entry's install folder
 * still names survives a later uninstall, at user and project scope, and
 * while a marker in an entry's folders can't be read nothing is
 * collected; once it can, the tap goes. A path that can't hold a marker
 * names nothing, nor does a folder crew can't search in an agent no entry
 * is installed in. A project entry whose root is missing, relative, or not
 * a string locates no folder, so it neither stops collection nor breaks it.
 * Folders entries' agents install into: `./agent-folders.test.ts`.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join, relative } from "node:path";
import { claudeCodeAdapter } from "../../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../../../src/agents/gemini-cli.ts";
import { readState, writeState } from "../../../../../src/state/load.ts";
import { makeCrewHome } from "../../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../../helpers/fixtures.ts";
import { buildRepo } from "../../helpers.ts";
import {
  BOTH,
  CLAUDE,
  crew,
  markerTap,
  NOT_MARKERS,
  plantMarker,
  redirectAgents,
  tapKept,
  tapOf,
} from "../helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

for (const scope of ["user", "project"] as const) {
  test(`C-UPD-17 C-INST-13n an old tap a stuck copy still names survives a later uninstall (${scope})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    const cwd = scope === "project" ? makeTempDir("crew-project-") : undefined;
    const scopeFlags = cwd ? ["--scope", "project"] : [];
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...scopeFlags, ...BOTH], cwd)).toBe(
      0,
    );
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    const codexRoot = cwd ? codexAdapter.projectPath(cwd) : codexAdapter.userPath();
    const copy = join(codexRoot, "a");
    chmodSync(copy, 0o555);
    try {
      const reinstall = ["install", `file://${repo}@v1`, ...scopeFlags, ...BOTH, "--force"];
      expect(crew(home, reinstall, cwd)).toBe(0);
    } finally {
      chmodSync(copy, 0o755);
    }
    const uninstall = ["uninstall", ...scopeFlags, "b", "--yes"];
    expect(crew(home, uninstall, cwd)).toBe(0);
    expect(markerTap(codexRoot, "a")).toBe(ownTap);
    expect(tapKept(home, ownTap)).toBe(true);
  });
}

/**
 * A project root that is missing, relative, or not a string. The relative
 * one points at a decoy whose marker names the tap: read against the
 * process's cwd, it would keep the tap.
 */
function malformedRoot(kind: "missing" | "relative" | "non-string", aTap: string): unknown {
  if (kind === "missing") return undefined;
  if (kind === "non-string") return 42;
  const decoy = makeTempDir("crew-decoy-");
  // A real marker's shape, so a collector checking more of it still sees one.
  plantMarker(join(decoy, ".claude", "skills", "z"), join(claudeCodeAdapter.userPath(), "z"), {
    tap_name: aTap,
  });
  return relative(process.cwd(), decoy);
}

for (const kind of ["missing", "relative", "non-string"] as const) {
  test(`C-UPD-17 a project entry whose root is ${kind} neither stops collection nor breaks it`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "z"]);
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...CLAUDE])).toBe(0);
    expect(crew(home, ["install", `file://${repo}//skills/z`, ...CLAUDE])).toBe(0);
    const aTap = tapOf(home, "a");
    const root = malformedRoot(kind, aTap);
    const state = readState(home);
    const z = state.installations.find((e) => e.name === "z")!;
    const malformed = {
      ...z,
      scope: "project",
      ...(root === undefined ? {} : { project_root: root }),
    } as unknown as typeof z;
    writeState({ schema_version: 1, installations: [...state.installations, malformed] }, home);

    expect(crew(home, ["uninstall", "a", "--yes"])).toBe(0);
    expect(tapKept(home, aTap)).toBe(false);
  });
}

for (const [what, plant] of NOT_MARKERS) {
  test(`C-UPD-17 ${what} names no tap, and doesn't stop collection`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "z"]);
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...CLAUDE])).toBe(0);
    expect(crew(home, ["install", `file://${repo}//skills/z`, ...BOTH])).toBe(0);
    const aTap = tapOf(home, "a");
    const intact = plant(join(codexAdapter.userPath(), "z"));
    expect(crew(home, ["uninstall", "a", "--yes"])).toBe(0);
    expect(tapKept(home, aTap)).toBe(false);
    expect(intact()).toBe(true);
  });
}

test("C-UPD-17 a folder crew can't search, in an agent no entry is installed in, names nothing", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "z"]);
  expect(crew(home, ["install", `file://${repo}//skills/a`, ...CLAUDE])).toBe(0);
  expect(crew(home, ["install", `file://${repo}//skills/z`, ...CLAUDE])).toBe(0);
  const aTap = tapOf(home, "a");
  const unused = geminiCliAdapter.userPath();
  chmodSync(unused, 0o000);
  try {
    expect(crew(home, ["uninstall", "a", "--yes"])).toBe(0);
  } finally {
    chmodSync(unused, 0o755);
  }
  expect(tapKept(home, aTap)).toBe(false);
});

test("C-UPD-17 a copy in an agent its entry doesn't list still names its tap", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "w", "z"]);
  for (const name of ["a", "w", "z"])
    expect(crew(home, ["install", `file://${repo}//skills/${name}`, ...CLAUDE])).toBe(0);
  const aTap = tapOf(home, "a");
  // A copy of z crew wrote but state never recorded, naming a's tap.
  const stray = join(codexAdapter.userPath(), "z");
  plantMarker(stray, join(claudeCodeAdapter.userPath(), "z"), {
    agents: ["codex"],
    tap_name: aTap,
  });
  expect(crew(home, ["uninstall", "a", "--yes"])).toBe(0);
  expect(tapKept(home, aTap)).toBe(true);

  // And one there crew can't read might name any: nothing is collected.
  const wTap = tapOf(home, "w");
  chmodSync(join(stray, ".crew.json"), 0o000);
  try {
    expect(crew(home, ["uninstall", "w", "--yes"])).toBe(0);
    expect(tapKept(home, wTap)).toBe(true);
  } finally {
    chmodSync(join(stray, ".crew.json"), 0o644);
  }
});

test("C-UPD-17 while a marker can't be read nothing is collected; once nothing blocks it, the tap goes", () => {
  const home = makeCrewHome();
  const [repoX, repoY] = [buildRepo(["x"]), buildRepo(["y"])];
  expect(crew(home, ["install", `file://${repoX}//skills/x`, ...CLAUDE])).toBe(0);
  expect(crew(home, ["install", `file://${repoY}//skills/y`, ...BOTH])).toBe(0);
  const xTap = tapOf(home, "x");
  // y's codex marker, unrelated to x's tap, can't be read.
  const marker = join(codexAdapter.userPath(), "y", ".crew.json");
  chmodSync(marker, 0o000);
  try {
    expect(crew(home, ["uninstall", "x", "--yes"])).toBe(0);
    expect(tapKept(home, xTap)).toBe(true);
  } finally {
    chmodSync(marker, 0o644);
  }
  expect(crew(home, ["uninstall", "y", "--yes"])).toBe(0);
  expect(tapKept(home, xTap)).toBe(false);
});
