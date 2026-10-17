/**
 * Doctor's check 9 for markers crew can read but can't use (§11.2;
 * C-STATE-05a): one whose tap wouldn't load as a `config.yaml` row, or
 * one that isn't its folder's (another skill's name, another scope). Each
 * is an `unreadable_marker` naming the marker; `--repair` keeps the entry
 * it hides, writes nothing from it — `config.yaml` still loads, with the
 * taps it had — and repeated repairs leave state as it was.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { readConfig } from "../../../src/config/load.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { buildRepo, codes, doctor, must, redirectAgents } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/** A change to codex's marker for `a`, and the reason doctor gives for it. */
const UNUSABLE: readonly (readonly [string, Record<string, unknown>, string])[] = [
  [
    "an empty tap name",
    { tap_name: "" },
    "its tap wouldn't load: each tap needs a non-empty `name`",
  ],
  [
    "a tap name that isn't one folder name",
    { tap_name: "../x" },
    "its tap wouldn't load: tap name `../x` is invalid — a tap name is a single directory name and cannot equal `.` or `..` or contain `/`, `\\`, or NUL",
  ],
  [
    "a git tap with no URL",
    { tap_name: "lost", tap_kind: "git", tap_url: "" },
    "its tap wouldn't load: tap `lost` (kind: git) needs a non-empty `url`",
  ],
  [
    "a path tap with no path",
    { tap_name: "lost", tap_kind: "path", tap_path: "" },
    "its tap wouldn't load: tap `lost` (kind: path) needs a non-empty `path`",
  ],
  ["another skill's name", { name: "b" }, "not this folder's marker: it names the skill `b`"],
  ["another scope", { scope: "project" }, "not this folder's marker: it records project scope"],
];

/** Install `a` in codex only, then apply `change` to its marker; the marker's path. */
function installAndBreak(home: string, change: Record<string, unknown>): string {
  must(home, ["install", `file://${buildRepo(["a"])}`, "--agent", "codex"]);
  const marker = join(codexAdapter.userPath(), "a", ".crew.json");
  const real = JSON.parse(readFileSync(marker, "utf8")) as object;
  writeFileSync(marker, JSON.stringify({ ...real, ...change }));
  return marker;
}

for (const [what, change, reason] of UNUSABLE) {
  test(`C-STATE-05a a marker with ${what} is reported, and --repair writes nothing from it`, () => {
    const home = makeCrewHome();
    const marker = installAndBreak(home, change);
    const plain = doctor(home);
    expect(plain.code).toBe(1);
    expect(codes(plain.findings)).toEqual(["unreadable_marker:error"]);
    expect(plain.findings[0]!.message).toBe(
      `crew can't use \`${marker}\` (${reason}); reinstall it with \`--force\``,
    );

    const configPath = join(home, "config.yaml");
    const config = readFileSync(configPath, "utf8");
    const before = readState(home);
    for (let run = 0; run < 2; run++) expect(doctor(home, ["--repair"]).code).toBe(1);
    expect(readFileSync(configPath, "utf8")).toBe(config);
    expect(readConfig(home).taps.length).toBeGreaterThan(0);
    expect(readState(home)).toEqual(before);
  });
}

test("C-STATE-05a a marker state no longer lists, with another scope, never becomes an entry", () => {
  const home = makeCrewHome();
  installAndBreak(home, { scope: "project" });
  // State forgot the install: a usable marker would be rebuilt into it.
  writeState({ schema_version: 1, installations: [] }, home);
  for (let run = 0; run < 3; run++) doctor(home, ["--repair"]);
  expect(readState(home).installations).toEqual([]);
});
