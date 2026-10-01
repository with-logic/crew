/**
 * Linux systemd autoupdate coverage (§10.2, C-AUTO): disable, including
 * its failure and partial-state paths.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner, setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

const ok = { ok: true, stderr: "" };
const failed = (stderr: string = "systemctl failed") => ({ ok: false, stderr });

const savedSystemdDir = process.env["CREW_SYSTEMD_USER_DIR"];

beforeEach(() => {
  process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
  setAutoupdatePlatform("linux");
});

afterEach(() => {
  if (savedSystemdDir === undefined) delete process.env["CREW_SYSTEMD_USER_DIR"];
  else process.env["CREW_SYSTEMD_USER_DIR"] = savedSystemdDir;
  resetAutoupdatePlatform();
  resetSystemctlRunner();
});

describe("systemd autoupdate commands", () => {
  test("C-AUTO-04 disable removes units and reloads", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return ok;
    });
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    calls.length = 0;
    const code = runCli(["autoupdate", "disable"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
    expect(calls).toContainEqual(["disable", "--now", "sh.crew.autoupdate.timer"]);
    expect(calls).toContainEqual(["daemon-reload"]);
    expect(readConfig(home).autoupdate.enabled).toBe(false);
  });

  test("disable without units is a no-op", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    // Missing unit files no longer imply an inactive timer: disable asks
    // systemd whether the unit is still loaded, because a unit can
    // outlive its file. With no units AND an inactive timer there is
    // nothing to do, so `is-active` must be the only call.
    setSystemctlRunner((args) => {
      calls.push([...args]);
      if (args[0] === "is-active") return failed("inactive");
      throw new Error(`should not call systemctl ${args.join(" ")}`);
    });
    const code = runCli(["autoupdate", "disable"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(calls.every((a) => a[0] === "is-active")).toBe(true);
  });

  test("disable unloads a timer whose unit files are already gone", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    // The dangerous case: no unit files, but systemd still holds the
    // timer. Returning early here would report success while the
    // updater kept firing.
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return ok; // `is-active` succeeds → the timer is still loaded
    });
    const code = runCli(["autoupdate", "disable"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(calls.some((a) => a[0] === "disable")).toBe(true);
  });

  test("disable reports post-removal daemon-reload failure", () => {
    const home = makeCrewHome();
    setSystemctlRunner(() => ok);
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    setSystemctlRunner((args) => (args[0] === "daemon-reload" ? failed("reload failed") : ok));
    const c = captureStreams();
    const code = runCli(["autoupdate", "disable"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("reload failed");
    expect(readConfig(home).autoupdate.enabled).toBe(true);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
  });

  test("failed disable leaves units for a retry", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner(() => ok);
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return args[0] === "disable" && calls.length === 1 ? failed("unit busy") : ok;
    });
    const c = captureStreams();
    const code = runCli(["autoupdate", "disable"], { home, streams: c.streams });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("unit busy");
    expect(readConfig(home).autoupdate.enabled).toBe(true);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(true);
    const retry = runCli(["autoupdate", "disable"], { home, streams: captureStreams().streams });
    expect(retry).toBe(0);
    expect(calls.filter((a) => a[0] === "disable")).toHaveLength(2);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
  });
});
