/**
 * The edges of a whole install's reinstall that moves a tracking entry
 * (§5.4, §11.1; C-UPD-16b, C-INST-13n). The entry's markers in agents the run doesn't
 * target follow the move, at user and project scope. A targeted agent's
 * own copy is the install's to report, agent by agent; a reinstall that
 * fails on every agent leaves the entry, its subscription, markers, and
 * tap as they were. (A copy that can't follow: `./refusals.test.ts`; one
 * that fails beside one that succeeds: `./partial.test.ts`.)
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
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
  test(`C-INST-13n a reinstall that moves an entry moves its markers in agents it didn't touch (${scope})`, () => {
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

/** A targeted agent's own copy, spoiled so the reinstall can't replace it. */
const OWN_COPY_FAULTS = [
  { label: "can't be written", corruptMarker: false },
  { label: "has a marker crew can't parse", corruptMarker: true },
] as const;

for (const { label, corruptMarker } of OWN_COPY_FAULTS) {
  test(`C-INST-13n a reinstall whose only copy ${label} fails that agent, not the run`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    expect(install(home, `file://${repo}//skills/a`).code).toBe(0);
    const ownTap = tapOf(home, "a");
    tagRepo(repo, "v1");
    const ownCopy = join(claudeCodeAdapter.userPath(), "a");
    const markerPath = join(ownCopy, ".crew.json");
    const marker = readFileSync(markerPath, "utf8");
    if (corruptMarker) writeFileSync(markerPath, "{not json");
    else chmodSync(ownCopy, 0o555);
    let after: string;
    try {
      // The install's to report, so a dry run doesn't refuse it either.
      expect(crew(home, ["install", `file://${repo}@v1`, ...CLAUDE, "--force", "--dry-run"])).toBe(
        0,
      );
      expect(crew(home, ["install", `file://${repo}@v1`, ...CLAUDE, "--force"])).toBe(1);
      after = readFileSync(markerPath, "utf8");
    } finally {
      chmodSync(ownCopy, 0o755);
      writeFileSync(markerPath, marker);
    }
    // The copy, its marker, and the entry are as they were; the sibling installs.
    expect(after).toBe(corruptMarker ? "{not json" : marker);
    expect(tapOf(home, "a")).toBe(ownTap);
    expect(tapOf(home, "b")).not.toBe(ownTap);
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
