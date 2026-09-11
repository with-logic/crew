/**
 * `crew autoupdate enable|disable --dry-run` (§10.2, C-AUTO-11). Both
 * platform backends are driven through their runner seams; no real
 * launchctl or systemctl is ever invoked.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner, setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { readOrNull } from "./helpers.ts";

describe("C-AUTO-11 autoupdate enable/disable --dry-run", () => {
  const savedLaunchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];
  const savedSystemdDir = process.env["CREW_SYSTEMD_USER_DIR"];
  let schedulerCalls = 0;

  beforeEach(() => {
    process.env["CREW_LAUNCH_AGENTS_DIR"] = makeCrewHome();
    process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
    schedulerCalls = 0;
    setLaunchctlRunner(() => {
      schedulerCalls++;
      return true;
    });
    setSystemctlRunner(() => {
      schedulerCalls++;
      return { ok: true, stderr: "" };
    });
  });

  afterEach(() => {
    if (savedLaunchAgentsDir === undefined) delete process.env["CREW_LAUNCH_AGENTS_DIR"];
    else process.env["CREW_LAUNCH_AGENTS_DIR"] = savedLaunchAgentsDir;
    if (savedSystemdDir === undefined) delete process.env["CREW_SYSTEMD_USER_DIR"];
    else process.env["CREW_SYSTEMD_USER_DIR"] = savedSystemdDir;
    resetAutoupdatePlatform();
    resetLaunchctlRunner();
    resetSystemctlRunner();
  });

  test("macOS enable names the plist, calls no launchctl, writes nothing", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable", "--interval", "30m", "--dry-run"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would enable autoupdate");
    expect(c.stdout()).toContain("every 30 minutes");
    expect(c.stdout()).toContain("sh.crew.autoupdate.plist");
    expect(schedulerCalls).toBe(0);
    expect(existsSync(paths(home).autoupdatePlist)).toBe(false);
    expect(existsSync(paths(home).configFile)).toBe(false);
    expect(existsSync(paths(home).stateFile)).toBe(false);
  });

  test("Linux enable --json lists both unit files with dry_run: true", () => {
    setAutoupdatePlatform("linux");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable", "--dry-run", "--json"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(c.stdout());
    expect(parsed.dry_run).toBe(true);
    expect(parsed.interval_seconds).toBe(14400);
    expect(parsed.artifacts).toEqual([
      paths(home).autoupdateSystemdService,
      paths(home).autoupdateSystemdTimer,
    ]);
    expect(schedulerCalls).toBe(0);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
  });

  test("Linux disable --dry-run names both unit files and removes neither", () => {
    setAutoupdatePlatform("linux");
    const home = makeCrewHome();
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const service = readFileSync(paths(home).autoupdateSystemdService, "utf8");
    const timer = readFileSync(paths(home).autoupdateSystemdTimer, "utf8");
    const callsAfterEnable = schedulerCalls;

    const c = captureStreams();
    const code = runCli(["autoupdate", "disable", "--dry-run", "--json"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.stdout())).toEqual({
      enabled: false,
      dry_run: true,
      artifacts: [paths(home).autoupdateSystemdService, paths(home).autoupdateSystemdTimer],
    });
    expect(schedulerCalls).toBe(callsAfterEnable);
    expect(readFileSync(paths(home).autoupdateSystemdService, "utf8")).toBe(service);
    expect(readFileSync(paths(home).autoupdateSystemdTimer, "utf8")).toBe(timer);
    expect(readConfig(home).autoupdate.enabled).toBe(true);
  });

  test("disable --dry-run leaves an enabled scheduler in place", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const plist = readFileSync(paths(home).autoupdatePlist, "utf8");
    const config = readOrNull(paths(home).configFile);
    const callsAfterEnable = schedulerCalls;
    const c = captureStreams();
    const code = runCli(["autoupdate", "disable", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would disable autoupdate");
    expect(c.stdout()).toContain("would unload and remove");
    expect(schedulerCalls).toBe(callsAfterEnable);
    expect(readFileSync(paths(home).autoupdatePlist, "utf8")).toBe(plist);
    expect(readOrNull(paths(home).configFile)).toBe(config);
    expect(readConfig(home).autoupdate.enabled).toBe(true);
  });

  test("repeated dry runs make zero scheduler calls and leave config alone", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const config = readOrNull(paths(home).configFile);
    const plist = readFileSync(paths(home).autoupdatePlist, "utf8");
    const callsAfterEnable = schedulerCalls;

    for (const args of [
      ["autoupdate", "enable", "--dry-run"],
      ["autoupdate", "disable", "--dry-run"],
      ["autoupdate", "enable", "--dry-run"],
    ]) {
      expect(runCli(args, { home, streams: captureStreams().streams })).toBe(0);
    }

    expect(schedulerCalls).toBe(callsAfterEnable);
    expect(readOrNull(paths(home).configFile)).toBe(config);
    expect(readFileSync(paths(home).autoupdatePlist, "utf8")).toBe(plist);
  });

  test("real enable/disable report dry_run: false in JSON", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    const on = captureStreams();
    runCli(["autoupdate", "enable", "--json"], { home, streams: on.streams });
    expect(JSON.parse(on.stdout()).dry_run).toBe(false);
    const off = captureStreams();
    runCli(["autoupdate", "disable", "--json"], { home, streams: off.streams });
    expect(JSON.parse(off.stdout())).toEqual({ enabled: false, dry_run: false });
  });

  test("unsupported platform still fails on a dry run", () => {
    setAutoupdatePlatform("win32");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("not supported on win32");
  });
});
