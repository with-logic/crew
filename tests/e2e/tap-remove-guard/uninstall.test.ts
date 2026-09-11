/**
 * `crew tap remove --uninstall` (§16.3, C-TAP-16d): removing the
 * attached skills before the tap. The abort paths live in
 * `./aborts.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { cloneDirForTap } from "../../helpers/fixtures.ts";
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
    // Resolve the shared clone before removal — afterwards the tap row is
    // gone and the path can no longer be looked up from config.
    const clone = cloneDirForTap("mytap", home)!;

    const r = run(home, ["tap", "remove", "--uninstall", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Uninstalling alpha");
    expect(r.stdout).toContain("Removed tap mytap");
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(false);
    expect(readState(home).installations).toHaveLength(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
    expect(existsSync(clone)).toBe(false);
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
    expect(existsSync(cloneDirForTap("mytap", home)!)).toBe(true);
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
    expect(existsSync(cloneDirForTap("othertap", home)!)).toBe(true);
  });
});
