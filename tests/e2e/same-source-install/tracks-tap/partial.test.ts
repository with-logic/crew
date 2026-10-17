/**
 * A reinstall that moves an entry, failing on one targeted agent and
 * succeeding on another (§5.4, §15; C-INST-13n). The entry moves, and the
 * failed copy — reported for that agent — follows where crew can read and
 * rewrite its marker (a copy with local edits keeps its bytes, hash, and
 * SHA but moves); one it can't read or rewrite — unwritable, locked,
 * unreadable — keeps naming the old tap, which is kept, by this install
 * and by any later collection (which reads the markers, and collects
 * nothing while one can't be read), so nothing names a tap that's gone.
 * One crew can't parse names nothing; a wrong-shaped one isn't the
 * move's, though the tap it names is kept just the same.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import type { Marker } from "../../../../src/core/types.ts";
import { readJson } from "../../../../src/util/json.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter, tagRepo } from "../../../helpers/fixtures.ts";
import { buildRepo } from "../helpers.ts";
import { BOTH, crew, markerTap, redirectAgents, tapKept, tapOf } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/** `a` installed into `first`, then the repo tagged `v1`; the home, repo, and `a`'s own tap. */
function setUp(first: readonly string[]): { home: string; repo: string; ownTap: string } {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  const installed = crew(home, ["install", `file://${repo}//skills/a`, ...first]);
  if (installed !== 0) throw new Error(`setup install exited ${installed}`);
  tagRepo(repo, "v1");
  return { home, repo, ownTap: tapOf(home, "a") };
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

/** A failed copy's marker crew can't read or rewrite: how to cause it, returning its undo. */
const STUCK_MARKERS: readonly (readonly [string, (marker: string) => () => void])[] = [
  [
    "can't be read",
    (marker) => {
      chmodSync(marker, 0o000);
      return () => chmodSync(marker, 0o644);
    },
  ],
  [
    "has the wrong shape",
    (marker) => {
      const before = readFileSync(marker, "utf8");
      writeFileSync(marker, JSON.stringify({ ...JSON.parse(before), agents: {} }));
      return () => writeFileSync(marker, before);
    },
  ],
  ...(process.platform === "darwin"
    ? [
        [
          "is locked",
          (marker: string) => {
            Bun.spawnSync(["chflags", "uchg", marker]);
            return () => Bun.spawnSync(["chflags", "nouchg", marker]);
          },
        ] as const,
      ]
    : []),
];

for (const [what, spoil] of STUCK_MARKERS) {
  test(`C-INST-13n C-UPD-17 a failed copy whose marker ${what} keeps the old tap, now and later`, () => {
    const { home, repo, ownTap } = setUp(BOTH);
    const marker = join(codexAdapter.userPath(), "a", ".crew.json");
    const restore = spoil(marker);
    try {
      expect(crew(home, ["install", `file://${repo}@v1`, ...BOTH, "--force"])).toBe(0);
      expect(tapOf(home, "a")).not.toBe(ownTap);
      expect(tapOf(home, "b")).toBe(tapOf(home, "a"));
      expect(tapKept(home, ownTap)).toBe(true);
      // Nor does a later collection take it, the marker still as it was.
      expect(crew(home, ["uninstall", "b", "--yes"])).toBe(0);
      expect(tapKept(home, ownTap)).toBe(true);
    } finally {
      restore();
    }
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
  const before = readJson<Marker>(join(codexAdapter.userPath(), "a", ".crew.json"));
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
  // Still the bytes it had: crew goes on seeing the local edits.
  const after = readJson<Marker>(join(codexAdapter.userPath(), "a", ".crew.json"));
  expect([after.content_hash, after.resolved_sha]).toEqual([
    before.content_hash,
    before.resolved_sha,
  ]);
  expect(tapKept(home, ownTap)).toBe(false);
});
