/**
 * What removing a failed tap child leaves (§10.1.1 step 2; C-UPD-18e):
 * a copy the child was just installed into that no longer holds what crew
 * wrote — edited, its marker changed, or unreadable, before a later
 * agent's folder failed — is someone's, and stays; so does one crew can't
 * remove. Each is named in the child's failure, which keeps the failing
 * agent's own code.
 *
 * The change is made while the update runs: `--verbose` reports each
 * agent's install as it starts, and the test acts on the copy already
 * made when the later agent's line arrives.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { isTapErrorRow, type TapReexpandRow } from "../../../../src/install/tap-reexpand/types.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { installTrackedTap, redirectAgents, whileReadOnly } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/**
 * `crew update --json`, with new child `gamma` failing in gemini-cli's
 * read-only folder; `act` runs on claude-code's fresh copy as gemini-cli's
 * install starts. The exit code, the child's error, and whether state
 * recorded it.
 */
function updateFailingChild(home: string, act: (copy: string) => void) {
  const copy = join(agents.roots["claude-code"], "gamma");
  let stdout = "";
  const streams = {
    stdout: (s: string) => {
      stdout += s;
    },
    stderr: (s: string) => {
      if (s.includes("installing gamma") && s.includes("(gemini-cli)")) act(copy);
    },
  };
  const code = whileReadOnly(agents.roots["gemini-cli"], () =>
    runCli(["update", "--json", "--verbose"], { home, streams }),
  );
  const rows = JSON.parse(stdout).tap_reexpand_rows as readonly TapReexpandRow[];
  const recorded = readState(home).installations.some((e) => e.name === "gamma");
  return { code, error: rows.filter(isTapErrorRow)[0]!.error, recorded, copy };
}

/** A tracked tap `mine` installed in both agents, with a new child `gamma` upstream. */
function trackedTapWithNewChild(): string {
  const home = makeCrewHome();
  const tapDir = installTrackedTap(home);
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
  return home;
}

/** What crew moved aside to remove and left in claude-code's folder; none, once it's done. */
function setAside(): string[] {
  return readdirSync(agents.roots["claude-code"]).filter((n) => n.startsWith(".crew-removing-"));
}

test("C-UPD-18e a copy edited before the child failed is left at its own path, and named", () => {
  const home = trackedTapWithNewChild();
  const r = updateFailingChild(home, (copy) => appendFileSync(join(copy, "SKILL.md"), "Mine.\n"));
  expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
  expect(r.error.message).toContain(
    `left in place: \`${r.copy}\` (crew can't confirm it still holds what this run installed)`,
  );
  // Moved aside to be checked, and back where it was.
  expect(readFileSync(join(r.copy, "SKILL.md"), "utf8")).toEndWith("Mine.\n");
  expect(setAside()).toEqual([]);
});

test("C-UPD-18e a copy still as this run wrote it is removed, leaving nothing aside", () => {
  const home = trackedTapWithNewChild();
  const r = updateFailingChild(home, () => {});
  expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
  expect(r.error.message).not.toContain("left in place");
  expect(existsSync(r.copy)).toBe(false);
  expect(setAside()).toEqual([]);
});

/** Rewrite one field of the marker in `copy`. */
function rewriteMarker(copy: string, field: string, value: string): void {
  const marker = JSON.parse(readFileSync(join(copy, ".crew.json"), "utf8"));
  writeFileSync(join(copy, ".crew.json"), JSON.stringify({ ...marker, [field]: value }));
}

/** Changes to a copy's marker alone; its content, which the hash covers, stays as written (§12.1). */
const MARKER_ONLY: readonly (readonly [string, (copy: string) => void])[] = [
  ["deleted", (copy) => rmSync(join(copy, ".crew.json"))],
  ["rewritten to another hash", (copy) => rewriteMarker(copy, "content_hash", "sha256:0")],
  ["rewritten to another skill's name", (copy) => rewriteMarker(copy, "name", "other")],
  // Name and content hash as written: only the marker's own bytes tell.
  [
    "rewritten in a field neither its name nor its hash covers",
    (copy) => rewriteMarker(copy, "installed_at", "2000-01-01T00:00:00.000Z"),
  ],
];

for (const [what, act] of MARKER_ONLY) {
  test(`C-UPD-18e a copy whose marker was ${what} before the child failed is left, and named`, () => {
    const home = trackedTapWithNewChild();
    const r = updateFailingChild(home, act);
    expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
    expect(r.error.message).toContain(`left in place: \`${r.copy}\` (crew can't confirm`);
    expect(existsSync(join(r.copy, "SKILL.md"))).toBe(true);
  });
}

test("C-UPD-18e a copy crew can no longer read is left, and named", () => {
  const home = trackedTapWithNewChild();
  const skillMd = join(agents.roots["claude-code"], "gamma", "SKILL.md");
  try {
    const r = updateFailingChild(home, () => chmodSync(skillMd, 0o000));
    expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
    expect(r.error.message).toContain(`left in place: \`${r.copy}\` (crew can't confirm`);
  } finally {
    chmodSync(skillMd, 0o644);
  }
  expect(existsSync(skillMd)).toBe(true);
});

test("C-UPD-18e a copy crew can't remove is left, and named beside the failure", () => {
  const home = trackedTapWithNewChild();
  const claudeRoot = agents.roots["claude-code"];
  try {
    const r = updateFailingChild(home, () => chmodSync(claudeRoot, 0o555));
    expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
    // The failure is still gemini-cli's folder; the removal is named after it.
    expect(r.error.message).toContain(agents.roots["gemini-cli"]);
    expect(r.error.message).toContain(
      `; left in place: \`${r.copy}\` (crew couldn't remove it — EACCES: permission denied)`,
    );
  } finally {
    chmodSync(claudeRoot, 0o755);
  }
});
