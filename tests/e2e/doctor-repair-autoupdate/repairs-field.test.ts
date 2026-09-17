/**
 * The `repairs` field and dry-run behaviour of `crew doctor --repair`'s autoupdate
 * reconciliation (§11.2 check 7, C-STATE-11e, C-STATE-12).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { setEnabled, useSchedulerSeams } from "./helpers.ts";

useSchedulerSeams();

describe("C-STATE-11e repairs is a --repair-only field", () => {
  test("no drift means an empty repairs array on --repair", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setLaunchctlRunner(() => false); // disabled in config and not loaded
    const c = captureStreams();
    runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(JSON.parse(c.stdout())).toEqual({ findings: [], repairs: [], dry_run: false });
  });

  test("a plain run omits the field entirely", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setLaunchctlRunner(() => false);
    const c = captureStreams();
    runCli(["doctor", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed).toEqual({ findings: [], dry_run: false });
    expect("repairs" in parsed).toBe(false);
  });

  test("a dry run applies nothing, so it omits the field too", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    setLaunchctlRunner(() => false);
    const c = captureStreams();
    runCli(["doctor", "--repair", "--dry-run", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.dry_run).toBe(true);
    expect("repairs" in parsed).toBe(false);
  });

  test("an unparseable config still reports repairs, empty", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setLaunchctlRunner(() => false);
    // Repair is skipped because rebuilding taps from markers against a
    // config we couldn't read would discard the user's file. The field
    // must still appear: "the repair ran and fixed nothing" has to be
    // distinguishable from "this wasn't a repair run".
    writeFileSync(paths(home).configFile, "taps: [oops\n");
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const parsed = JSON.parse(c.stdout());
    expect(parsed.repairs).toEqual([]);
    expect(parsed.findings.some((f: { code: string }) => f.code === "config_invalid")).toBe(true);
  });
});

describe("C-STATE-12 doctor --repair --dry-run never touches the scheduler", () => {
  test("drift is listed but launchctl is only queried, never loaded", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    const calls: string[][] = [];
    setLaunchctlRunner((args) => {
      calls.push([...args]);
      return false;
    });
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("would address 1 finding");
    expect(calls.every((a) => a[0] === "list")).toBe(true);
    expect(existsSync(paths(home).autoupdatePlist)).toBe(false);
  });
});
