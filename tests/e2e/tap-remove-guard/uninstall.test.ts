/**
 * `crew tap remove --uninstall` (§16.3, C-TAP-16d): removing the
 * attached skills before the tap, and what happens when one aborts.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { paths, tapPath } from "../../../src/core/paths.ts";
import { readState } from "../../../src/state/load.ts";
import {
  agentRoot,
  buildTapRepo,
  makeCrewHome,
  makeTempDir,
  run,
  runIn,
  tapWithInstall,
  useTempAgentRoot,
} from "./helpers.ts";

useTempAgentRoot();

describe("C-TAP-16d tap remove --uninstall", () => {
  test("removes the skills and then the tap", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(true);

    const r = run(home, ["tap", "remove", "--uninstall", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Uninstalling alpha");
    expect(r.stdout).toContain("Removed tap mytap");
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(false);
    expect(readState(home).installations).toHaveLength(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
    expect(existsSync(tapPath("mytap", home))).toBe(false);
  });

  test("a safety abort keeps the tap so the user can retry", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    // Drop the marker so removal hits `untracked_directory` (§7.4 step 1).
    rmSync(join(agentRoot(), "alpha", ".crew.json"));

    const r = run(home, ["tap", "remove", "--uninstall", "mytap"]);

    expect(r.code).toBe(1);
    expect(r.stdout).toContain("Kept tap mytap");
    expect(r.stdout).toContain("--force --uninstall");
    // The tap survives so the retry has something to act on.
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(true);
  });

  test("C-TAP-16d an aborted removal keeps its state entry so a retry can't orphan it", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    rmSync(join(agentRoot(), "alpha", ".crew.json"));

    expect(run(home, ["tap", "remove", "--uninstall", "mytap"]).code).toBe(1);
    // The bytes still exist, so state must still claim them. Dropping the
    // entry would hide the install from the guard, and the forced retry
    // below would then delete the tap and leave the skill unattributed.
    expect(readState(home).installations).toHaveLength(1);

    const retry = run(home, ["tap", "remove", "--force", "--uninstall", "mytap"]);

    expect(retry.code).toBe(0);
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(false);
    expect(readState(home).installations).toHaveLength(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });

  test("C-TAP-16d only the removed tap's skills come off", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo("alpha"), "tapa")).toBe(0);
    expect(tapWithInstall(home, buildTapRepo("beta"), "tapb")).toBe(0);

    const r = run(home, ["tap", "remove", "--uninstall", "tapa"]);

    expect(r.code).toBe(0);
    // `beta` belongs to another tap and must survive untouched.
    const survivors = readState(home).installations.map((e) => `${e.name}/${e.source.tap}`);
    expect(survivors).toEqual(["beta/tapb"]);
    expect(existsSync(join(agentRoot(), "beta"))).toBe(true);
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(false);
    expect(readConfig(home).taps.some((t) => t.name === "tapb")).toBe(true);
  });

  test("--dry-run changes nothing", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "--uninstall", "--dry-run", "mytap", "--json"]);

    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout) as { dry_run: boolean; uninstalled: unknown[] };
    expect(payload.dry_run).toBe(true);
    expect(payload.uninstalled).toHaveLength(1);
    // Install, state, config, and clone all survive the preview.
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(true);
    expect(existsSync(join(agentRoot(), "alpha", ".crew.json"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
    expect(existsSync(tapPath("mytap", home))).toBe(true);
  });

  test("--dry-run output reads as a preview, not as work already done", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "--uninstall", "--dry-run", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would uninstall alpha");
    expect(r.stdout).not.toContain("Uninstalling alpha");
    expect(r.stdout).toContain("Would remove tap mytap");
  });

  test("C-TAP-16d an agent with no adapter in this build keeps its ownership", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    // State written by a future crew, or an adapter since removed: we
    // cannot reach its install directory, so the bytes stay. Counting it
    // as removed would drop the entry and the tap, orphaning a real
    // install behind a success exit code.
    const p = paths(home);
    const state = JSON.parse(readFileSync(p.stateFile, "utf8")) as {
      installations: { agents: string[] }[];
    };
    for (const e of state.installations) e.agents = ["future-agent-9000"];
    writeFileSync(p.stateFile, JSON.stringify(state, null, 2));

    const r = run(home, ["tap", "remove", "--uninstall", "mytap"]);

    expect(r.code).toBe(1);
    expect(readState(home).installations).toHaveLength(1);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
  });

  test("removing one tap leaves a same-named skill from another tap alone", () => {
    const home = makeCrewHome();
    // Two taps each exposing a skill called `alpha`, installed at two
    // distinct §11.1 locations: `mytap`'s at user scope, `othertap`'s in a
    // project. Only `mytap`'s copy may come off; selecting by name alone
    // would take both, since an entry is keyed by (name, scope, root).
    expect(tapWithInstall(home, buildTapRepo(), "mytap")).toBe(0);
    expect(run(home, ["tap", "add", `file://${buildTapRepo()}`, "othertap"]).code).toBe(0);
    const proj = makeTempDir("crew-proj-");
    expect(
      runIn(home, ["install", "othertap", "--agent", "claude-code", "--scope", "project"], proj)
        .code,
    ).toBe(0);
    // Two real installs of the name `alpha`, one per tap.
    expect(readState(home).installations).toHaveLength(2);
    const otherDest = join(proj, ".claude", "skills", "alpha");
    expect(existsSync(otherDest)).toBe(true);

    const r = runIn(home, ["tap", "remove", "--uninstall", "mytap"], proj);

    expect(r.code).toBe(0);
    // `othertap`'s install, its state row, its config row, and its clone
    // all survive; only `mytap`'s user-scope copy came off.
    expect(existsSync(otherDest)).toBe(true);
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(false);
    const survivors = readState(home).installations;
    expect(survivors.map((e) => `${e.name}/${e.scope}/${e.source.tap}`)).toEqual([
      "alpha/project/othertap",
    ]);
    const config = readConfig(home);
    expect(config.taps.some((t) => t.name === "mytap")).toBe(false);
    expect(config.taps.some((t) => t.name === "othertap")).toBe(true);
    expect(existsSync(tapPath("othertap", home))).toBe(true);
  });

  test("C-TAP-16d a partial abort drops only the location that came off", () => {
    const home = makeCrewHome();
    // One skill NAME installed at two §11.1 locations from the same tap.
    // Keying cleanliness on the name group would retain BOTH rows when
    // one aborts, leaving state claiming a user-scope install whose bytes
    // were already deleted — and blocking the tap forever.
    expect(tapWithInstall(home, buildTapRepo("alpha"), "mytap")).toBe(0);
    const proj = makeTempDir("crew-proj-");
    expect(
      runIn(home, ["install", "mytap", "--agent", "claude-code", "--scope", "project"], proj).code,
    ).toBe(0);
    expect(readState(home).installations).toHaveLength(2);

    // Break ONLY the project copy so it aborts on `untracked_directory`.
    const projDest = join(proj, ".claude", "skills", "alpha");
    rmSync(join(projDest, ".crew.json"));

    const r = runIn(home, ["tap", "remove", "--uninstall", "mytap"], proj);

    expect(r.code).toBe(1);
    // The user-scope copy is gone from disk, so its row must be gone too.
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(false);
    // The aborted copy keeps both its bytes and its row.
    expect(existsSync(projDest)).toBe(true);
    const survivors = readState(home).installations;
    expect(survivors.map((e) => `${e.name}/${e.scope}`)).toEqual(["alpha/project"]);
    // The tap stays so the retry has something to act on.
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
  });
});
