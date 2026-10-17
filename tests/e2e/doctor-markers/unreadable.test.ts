/**
 * Doctor's check 9 (§11.2; C-STATE-05a): a marker crew can't read or
 * parse, one that is no complete marker (`null`, or missing a field crew
 * records), or a skills folder it can't list or look into, is an
 * `unreadable_marker` finding naming the path. The run doesn't fail on
 * it, doesn't also call the entries it hides `state_entry_without_marker`,
 * and `--repair` keeps those entries — their markers are unread, not
 * absent — and writes no tap from them.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { buildRepo, codes, doctor, must, redirectAgents } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/**
 * What crew can't read, the reason doctor gives, and how to make it so:
 * each takes codex's skills folder and returns the path doctor names and
 * an undo.
 */
const UNREADABLE: readonly (readonly [
  string,
  string,
  (root: string) => readonly [string, () => void],
])[] = [
  [
    "a marker crew can't read",
    "EACCES",
    (root) => {
      const marker = join(root, "a", ".crew.json");
      chmodSync(marker, 0o000);
      return [marker, () => chmodSync(marker, 0o644)];
    },
  ],
  [
    "a marker crew can't parse",
    "not valid JSON",
    (root) => {
      const marker = join(root, "a", ".crew.json");
      writeFileSync(marker, "{not json");
      return [marker, () => {}];
    },
  ],
  [
    "a marker that isn't a JSON object",
    "not a JSON object",
    (root) => {
      const marker = join(root, "a", ".crew.json");
      writeFileSync(marker, "[]");
      return [marker, () => {}];
    },
  ],
  [
    "a marker that is JSON null",
    "not a JSON object",
    (root) => {
      const marker = join(root, "a", ".crew.json");
      writeFileSync(marker, "null");
      return [marker, () => {}];
    },
  ],
  [
    "a marker missing the fields crew records",
    "not a crew marker: missing or invalid `schema_version`",
    (root) => {
      const marker = join(root, "a", ".crew.json");
      writeFileSync(marker, JSON.stringify({ agents: ["codex"], name: "a" }));
      return [marker, () => {}];
    },
  ],
  [
    "a marker holding a field of the wrong kind",
    "not a crew marker: missing or invalid `tap_kind`",
    (root) => {
      const marker = join(root, "a", ".crew.json");
      const real = JSON.parse(readFileSync(marker, "utf8")) as object;
      writeFileSync(marker, JSON.stringify({ ...real, tap_kind: "svn" }));
      return [marker, () => {}];
    },
  ],
  [
    "a skills folder crew can't list",
    "EACCES",
    (root) => {
      chmodSync(root, 0o000);
      return [root, () => chmodSync(root, 0o755)];
    },
  ],
  [
    "a skills folder below one crew can't search",
    "EACCES",
    (root) => {
      const parent = dirname(root);
      chmodSync(parent, 0o600);
      return [root, () => chmodSync(parent, 0o755)];
    },
  ],
  [
    "an install folder crew can't look into",
    "EACCES",
    (root) => {
      // Listable, but nothing in it can be looked up.
      chmodSync(root, 0o444);
      return [join(root, "a"), () => chmodSync(root, 0o755)];
    },
  ],
];

for (const [what, reason, make] of UNREADABLE) {
  test(`C-STATE-05a ${what} is reported, and --repair keeps the entry it hides`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a"]);
    // In codex only, so no marker crew can read keeps the entry for repair.
    must(home, ["install", `file://${repo}`, "--agent", "codex"]);
    const [path, undo] = make(codexAdapter.userPath());
    try {
      const plain = doctor(home);
      expect(plain.code).toBe(1);
      expect(codes(plain.findings)).toEqual(["unreadable_marker:error"]);
      expect(plain.findings[0]!.message).toContain(`\`${path}\` (${reason}`);

      const configPath = join(home, "config.yaml");
      const config = readFileSync(configPath, "utf8");
      const repaired = doctor(home, ["--repair"]);
      // Repair can't fix permissions, so the error stands.
      expect(repaired.code).toBe(1);
      const a = readState(home).installations.find((e) => e.name === "a");
      expect(a?.agents).toEqual(["codex"]);
      // Nothing from a marker crew couldn't use was written as a tap.
      expect(readFileSync(configPath, "utf8")).toBe(config);
      expect(readConfig(home).taps.length).toBeGreaterThan(0);
    } finally {
      undo();
    }
  });
}
