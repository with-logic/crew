/**
 * `crew doctor --repair` loads or unloads the platform scheduler to
 * match config (§11.2 check 7, C-STATE-11a/11b).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { setEnabled, statefulLaunchctl, useSchedulerSeams } from "./helpers.ts";

useSchedulerSeams();

describe("C-STATE-11a doctor --repair loads a scheduler the config expects", () => {
  test("launchd: writes the plist at the configured interval and bootstraps it", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true, 900);
    const calls: string[][] = [];
    setLaunchctlRunner(statefulLaunchctl(false, calls));
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(0);
    const parsed = JSON.parse(c.stdout());
    expect(parsed.findings.map((f: { code: string }) => f.code)).toContain("autoupdate_not_loaded");
    expect(parsed.repairs).toEqual([
      { level: "ok", code: "autoupdate_loaded", message: "loaded the background updater" },
    ]);
    expect(calls.some((a) => a[0] === "bootstrap")).toBe(true);
    const plist = paths(home).autoupdatePlist;
    expect(existsSync(plist)).toBe(true);
    // Read synchronously: an unawaited `.resolves` in a sync test
    // surfaces a mismatch as an unrelated timeout rather than a failed
    // assertion, which reads like flake to whoever hits it next.
    expect(readFileSync(plist, "utf8")).toContain("<integer>900</integer>");
  });

  test("systemd: writes the units and enables the timer", () => {
    setAutoupdatePlatform("linux");
    const home = makeCrewHome();
    setEnabled(home, true);
    const calls: string[][] = [];
    let active = false;
    setSystemctlRunner((args) => {
      calls.push([...args]);
      if (args[0] === "is-active") return { ok: active, stderr: "" };
      if (args[0] === "enable") {
        active = true;
        return { ok: true, stderr: "" };
      }
      return { ok: true, stderr: "" };
    });
    const c = captureStreams();
    const code = runCli(["doctor", "--repair"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Repaired what was fixable.");
    expect(c.stdout()).toContain("loaded the background updater");
    expect(calls.some((a) => a[0] === "enable")).toBe(true);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(true);
  });
});

describe("C-STATE-11b doctor --repair unloads a scheduler the config disabled", () => {
  test("launchd: boots the agent out and removes the plist", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, false);
    const plist = paths(home).autoupdatePlist;
    mkdirSync(dirname(plist), { recursive: true });
    writeFileSync(plist, "<plist/>");
    const calls: string[][] = [];
    setLaunchctlRunner(statefulLaunchctl(true, calls));
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(JSON.parse(c.stdout()).repairs).toEqual([
      { level: "ok", code: "autoupdate_unloaded", message: "unloaded the background updater" },
    ]);
    expect(calls.some((a) => a[0] === "bootout")).toBe(true);
    expect(existsSync(plist)).toBe(false);
  });
});
