/**
 * The attached-skill guard on `crew tap remove` (§16.3, C-TAP-16c/f)
 * plus flag-placement errors.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { cloneDirForTap } from "../../helpers/fixtures.ts";
import { buildTapRepo, makeCrewHome, run, tapWithInstall, useTempAgentRoot } from "./helpers.ts";

useTempAgentRoot();

describe("C-TAP-16c attached-skill guard", () => {
  test("refuses to remove a tap with installed skills and names them", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "mytap"]);

    expect(r.code).toBe(4);
    expect(r.stderr).toContain("alpha (user)");
    expect(r.stderr).toContain("--uninstall mytap");
    expect(r.stderr).toContain("--force mytap");
    // The tap and its clone survive the refusal.
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
    expect(existsSync(cloneDirForTap("mytap", home)!)).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
  });

  test("a tap with nothing installed still removes without extra flags", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    expect(run(home, ["tap", "add", `file://${repo}`, "mytap"]).code).toBe(0);

    const r = run(home, ["tap", "remove", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Removed tap mytap");
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });

  test("the JSON error payload lists the attached skills", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "mytap", "--json"]);

    expect(r.code).toBe(4);
    const payload = JSON.parse(r.stdout) as {
      error: { name: string; details: { attached: string[] } };
    };
    expect(payload.error.name).toBe("usage_error");
    expect(payload.error.details.attached).toEqual(["alpha (user)"]);
  });
});

describe("C-TAP-16f default-tap guard composes", () => {
  test("core with attached skills is still refused without --force", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    // Point `core` at a local repo so installing from it needs no network.
    const config = readConfig(home);
    const taps = config.taps.map((t) => (t.name === "core" ? { ...t, url: `file://${repo}` } : t));
    writeConfig({ ...config, taps }, home);
    expect(run(home, ["install", "core", "--agent", "claude-code"]).code).toBe(0);

    const refused = run(home, ["tap", "remove", "core"]);
    expect(refused.code).toBe(4);
    expect(refused.stderr).toContain("default tap");

    const both = run(home, ["tap", "remove", "--uninstall", "--force", "core"]);
    expect(both.code).toBe(0);
    expect(readState(home).installations).toHaveLength(0);
    expect(readConfig(home).taps.some((t) => t.name === "core")).toBe(false);
  });
});

describe("tap --uninstall flag placement", () => {
  test("--uninstall on another tap subcommand is a usage error", () => {
    const home = makeCrewHome();
    const r = run(home, ["tap", "list", "--uninstall"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("`--uninstall` only applies to `crew tap remove`");
  });

  test("--recursive on tap remove is a usage error", () => {
    const home = makeCrewHome();
    const r = run(home, ["tap", "remove", "--recursive", "mytap"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("`--recursive` only applies to `crew tap add`");
  });

  test("tap remove needs exactly one name", () => {
    const home = makeCrewHome();
    const r = run(home, ["tap", "remove"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("exactly one tap name");
  });

  test("C-TAP-16d the untap alias accepts --uninstall", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    // The alias is its own argv command word, so strict parsing must know
    // the flag its resolved subcommand supports.
    const r = run(home, ["untap", "--uninstall", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Removed tap mytap");
    expect(readState(home).installations).toHaveLength(0);
  });

  test("the untap alias still rejects --recursive", () => {
    const home = makeCrewHome();
    const r = run(home, ["untap", "--recursive", "mytap"]);
    // Rejected by the parser rather than by the command: the alias's flag
    // table lists only what `tap remove` accepts, so `--recursive` never
    // reaches dispatch. Stricter than `crew tap remove --recursive`, which
    // parses (the `tap` table has it, for `tap add`) and is refused later.
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("Unknown argument: recursive");
  });
});
