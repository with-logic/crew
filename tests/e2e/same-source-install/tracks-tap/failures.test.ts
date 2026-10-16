/**
 * The edges of a whole install's reinstall that moves a tracking entry
 * (§5.4, §11.1; C-UPD-16b). The entry's markers in agents the run doesn't
 * target follow the move, at user and project scope. A targeted agent's
 * own folder is the install's to report, agent by agent; a reinstall that
 * fails on every agent leaves the entry, its subscription, markers, and
 * tap as they were. (A copy that can't follow: `./refusals.test.ts`.)
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { readConfig } from "../../../../src/config/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo, install } from "../helpers.ts";
import {
  addSiblingAndUpdate,
  crew,
  markerTap,
  redirectAgents,
  tapOf,
  tracking,
} from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

const CLAUDE = ["--agent", "claude-code"];
const BOTH = [...CLAUDE, "--agent", "codex"];

for (const scope of ["user", "project"] as const) {
  test(`C-UPD-16b a reinstall that moves an entry moves its markers in agents it didn't touch (${scope})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    const cwd = scope === "project" ? makeTempDir("crew-project-") : undefined;
    const scopeFlags = cwd ? ["--scope", "project"] : [];
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...scopeFlags, ...BOTH], cwd)).toBe(
      0,
    );
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    // Reinstalled into claude-code only; codex's copy stays as it was.
    const reinstall = ["install", `file://${repo}@v1`, ...scopeFlags, ...CLAUDE, "--force"];
    expect(crew(home, reinstall, cwd)).toBe(0);
    expect(tapOf(home, "a")).not.toBe(ownTap);
    const codexRoot = cwd ? codexAdapter.projectPath(cwd) : codexAdapter.userPath();
    expect(markerTap(codexRoot, "a")).toBe(tapOf(home, "a"));
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(false);
  });
}

/**
 * A targeted agent's own copy the reinstall can't write: how it was
 * installed, which agent's copy is spoiled and how, the reinstall's
 * agents, and its exit — 1 when the skill failed on every agent, 0 when
 * another agent took it (§15). Each is the install's to report for that
 * agent, never a refusal of the run: the sibling still installs.
 */
const TARGETED_FAULTS = [
  {
    how: "reinstalled alone",
    first: CLAUDE,
    bad: "claude",
    corrupt: false,
    run: [...CLAUDE, "--force"],
    exit: 1,
  },
  {
    how: "with an unparseable marker",
    first: CLAUDE,
    bad: "claude",
    corrupt: true,
    run: [...CLAUDE, "--force"],
    exit: 1,
  },
  {
    how: "found up to date beside a new agent",
    first: CLAUDE,
    bad: "claude",
    corrupt: false,
    run: BOTH,
    exit: 0,
  },
  {
    how: "one of two targeted agents",
    first: BOTH,
    bad: "codex",
    corrupt: false,
    run: [...BOTH, "--force"],
    exit: 0,
  },
] as const;

for (const { how, first, bad, corrupt, run, exit } of TARGETED_FAULTS) {
  test(`C-UPD-16b a targeted agent's own copy that can't be written fails that agent, not the run (${how})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(crew(home, ["install", `file://${repo}//skills/a`, ...first])).toBe(0);
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    const badRoot = bad === "claude" ? claudeCodeAdapter.userPath() : codexAdapter.userPath();
    const badCopy = join(badRoot, "a");
    const marker = readFileSync(join(badCopy, ".crew.json"), "utf8");
    if (corrupt) writeFileSync(join(badCopy, ".crew.json"), "{not json");
    else chmodSync(badCopy, 0o555);
    try {
      expect(crew(home, ["install", `file://${repo}@v1`, ...run])).toBe(exit);
    } finally {
      chmodSync(badCopy, 0o755);
      writeFileSync(join(badCopy, ".crew.json"), marker);
    }
    expect(existsSync(join(claudeCodeAdapter.userPath(), "b", "SKILL.md"))).toBe(true);
    expect(tapOf(home, "b")).toBeString();
    // The failed copy keeps the marker it had: its bytes didn't move.
    expect(markerTap(badRoot, "a")).toBe(ownTap);
  });
}

for (const at of ["@v1", ""]) {
  test(`C-UPD-16b a failed reinstall leaves the entry, its subscription, its markers, and its tap as they were (${at || "same ref"})`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(install(home, `file://${repo}//skills`).code).toBe(0);
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    // claude-code's folder can't be written, so every reinstall fails.
    const root = claudeCodeAdapter.userPath();
    chmodSync(root, 0o555);
    try {
      expect(crew(home, ["install", `file://${repo}${at}`, ...CLAUDE, "--force"])).toBe(1);
    } finally {
      chmodSync(root, 0o755);
    }
    expect([tapOf(home, "a"), tapOf(home, "b")]).toEqual([ownTap, ownTap]);
    expect([markerTap(root, "a"), markerTap(root, "b")]).toEqual([ownTap, ownTap]);
    expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:-:true"]);
    expect(readConfig(home).taps.some((t) => t.name === ownTap)).toBe(true);

    // Still following its own tap: a sibling added there arrives.
    expect(addSiblingAndUpdate(home, repo)).toBe(0);
    expect(tracking(home)).toEqual(["a:auto:-:true", "b:auto:-:true", "c:auto:-:true"]);
  });
}
