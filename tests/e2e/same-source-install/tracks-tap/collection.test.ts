/**
 * Auto-tap collection after a move left a copy behind (§16.5; C-UPD-17,
 * C-INST-13n): a tap a crew marker at a state entry's install folder
 * still names survives a later uninstall, at user and project scope. A
 * project entry whose root is missing or relative locates no folder, so
 * it neither stops collection nor breaks it.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { readState, writeState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo } from "../helpers.ts";
import { crew, markerTap, redirectAgents, tapOf } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

const BOTH = ["--agent", "claude-code", "--agent", "codex"];

/** Whether a config tap of that name remains. */
function tapKept(home: string, name: string): boolean {
  return readConfig(home).taps.some((t) => t.name === name);
}

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
    // From elsewhere: collection finds the copy by the entry's own root.
    const uninstall = ["uninstall", ...scopeFlags, "b", "--yes"];
    expect(crew(home, uninstall, cwd)).toBe(0);
    expect(markerTap(codexRoot, "a")).toBe(ownTap);
    expect(tapKept(home, ownTap)).toBe(true);
  });
}

for (const root of [undefined, "relative", 42]) {
  test(`C-UPD-17 a project entry whose root is ${String(root)} neither stops collection nor breaks it`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "z"]);
    expect(crew(home, ["install", `file://${repo}//skills/a`, "--agent", "claude-code"])).toBe(0);
    expect(crew(home, ["install", `file://${repo}//skills/z`, "--agent", "claude-code"])).toBe(0);
    const aTap = tapOf(home, "a");
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
