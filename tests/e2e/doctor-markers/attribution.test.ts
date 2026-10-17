/**
 * Doctor's check 10 (§11.2; C-STATE-05b): a marker whose tap or path its
 * state entry doesn't share — a copy a move couldn't relabel (§5.4) — is
 * a `marker_attribution_drift` warning naming both, and `--repair` changes
 * neither the entry nor the marker.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { tagRepo } from "../../helpers/fixtures.ts";
import { BOTH, buildRepo, codes, doctor, must, redirectAgents } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

test("C-STATE-05b a copy a move couldn't relabel is reported, and --repair leaves it", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  must(home, ["install", `file://${repo}//skills/a`, ...BOTH]);
  const narrow = readState(home).installations[0]!.source.tap;
  tagRepo(repo, "v1");
  // codex's copy can't be rewritten, so its marker stays on the old tap.
  const copy = join(codexAdapter.userPath(), "a");
  chmodSync(copy, 0o555);
  try {
    must(home, ["install", `file://${repo}@v1`, ...BOTH, "--force"]);
  } finally {
    chmodSync(copy, 0o755);
  }
  const entry = readState(home).installations.find((e) => e.name === "a")!;
  expect(entry.source).not.toEqual({ tap: narrow, path: "" });

  const plain = doctor(home);
  // A warning: nothing is broken, so doctor still exits 0.
  expect(plain.code).toBe(0);
  expect(codes(plain.findings)).toEqual(["marker_attribution_drift:warn"]);
  const message = plain.findings[0]!.message;
  expect(message).toContain(`\`${copy}\` names tap \`${narrow}\`,`);
  expect(message).toContain(`on tap \`${entry.source.tap}\` at \`skills/a\``);

  const marker = readFileSync(join(copy, ".crew.json"), "utf8");
  expect(doctor(home, ["--repair"]).code).toBe(0);
  expect(readState(home).installations.find((e) => e.name === "a")!.source).toEqual(entry.source);
  expect(readFileSync(join(copy, ".crew.json"), "utf8")).toBe(marker);
  expect(codes(doctor(home).findings)).toEqual(["marker_attribution_drift:warn"]);
});

test("C-STATE-05b a marker's own text is printed escaped, so it can't forge output", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a"]);
  must(home, ["install", `file://${repo}`, ...BOTH]);
  const markerPath = join(codexAdapter.userPath(), "a", ".crew.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8")) as object;
  writeFileSync(markerPath, JSON.stringify({ ...marker, path: "x\u001b[2J\n✓ FORGED" }));
  const cap = captureStreams();
  expect(runCli(["doctor"], { home, streams: cap.streams })).toBe(0);
  expect(cap.stdout()).toContain("x\\x1b[2J\\x0a✓ FORGED");
  expect(cap.stdout()).not.toContain("\u001b[2J");
});

// A copy on another tap is reinstalled; one on the entry's tap at another
// path is retried (a relocation whose update failed elsewhere), then
// reinstalled if the retry finds it up to date (a copy left behind).
for (const [what, change, named, next] of [
  [
    "another path in its entry's tap",
    { path: "skills/elsewhere" },
    "tap `T` at `skills/elsewhere`",
    "run `crew update a` (if it reports the skill up to date, reinstall that copy with `--force`) to bring it in line",
  ],
  [
    "another tap at its entry's path",
    { tap_name: "elsewhere" },
    "tap `elsewhere` at `skills/a`",
    "reinstall that copy with `--force` to bring it in line",
  ],
] as const) {
  test(`C-STATE-05b a marker that names ${what} is reported too`, () => {
    const home = makeCrewHome();
    const repo = buildRepo(["a", "b"]);
    must(home, ["install", `file://${repo}`, ...BOTH]);
    const markerPath = join(codexAdapter.userPath(), "a", ".crew.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { tap_name: string };
    writeFileSync(markerPath, JSON.stringify({ ...marker, ...change }));
    const plain = doctor(home);
    expect(codes(plain.findings)).toEqual(["marker_attribution_drift:warn"]);
    const tap = marker.tap_name;
    expect(plain.findings[0]!.message).toContain(
      `names ${named.replace("`T`", `\`${tap}\``)}, but crew's records put a on tap \`${tap}\` at \`skills/a\`; ${next}`,
    );
  });
}
