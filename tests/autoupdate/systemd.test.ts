/**
 * Linux systemd autoupdate coverage (§10.2, C-AUTO).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner, setSystemctlRunner } from "../../src/autoupdate/systemd.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

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
  test("C-AUTO-01/03 enable writes units and enables timer", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return ok;
    });
    const code = runCli(["autoupdate", "enable", "--interval", "30m"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(true);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(true);
    expect(readConfig(home).autoupdate.interval_seconds).toBe(1800);
    expect(calls).toContainEqual(["daemon-reload"]);
    expect(calls).toContainEqual(["enable", "--now", "sh.crew.autoupdate.timer"]);
  });

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
    setSystemctlRunner(() => {
      throw new Error("should not call systemctl");
    });
    const code = runCli(["autoupdate", "disable"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
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

  test("C-AUTO-06 enable reports autoupdate_failure when systemctl fails", () => {
    const home = makeCrewHome();
    setSystemctlRunner((args) => (args[0] === "enable" ? failed("permission denied") : ok));
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("systemctl --user couldn't enable the autoupdate timer");
    expect(c.stderr()).toContain("permission denied");
    expect(readConfig(home).autoupdate.enabled).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
  });

  test("failed daemon-reload also removes written unit files", () => {
    const home = makeCrewHome();
    setSystemctlRunner((args) => (args[0] === "daemon-reload" ? failed("no user bus") : ok));
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("no user bus");
    expect(readConfig(home).autoupdate.enabled).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdService)).toBe(false);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
  });

  test("status uses systemctl is-active", () => {
    const home = makeCrewHome();
    setSystemctlRunner((args) => (args[0] === "is-active" ? failed() : ok));
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home, streams: c.streams });
    expect(c.stdout()).toContain("background updater isn't loaded");
  });

  test("systemd units contain effective CREW_HOME", () => {
    const home = makeCrewHome();
    setSystemctlRunner(() => ok);
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const service = readFileSync(paths(home).autoupdateSystemdService, "utf8");
    expect(service).toContain(`Environment=CREW_HOME=${home}`);
  });
});

describe("systemd platform dispatch", () => {
  test("unsupported scheduler platform fails cleanly", () => {
    setAutoupdatePlatform("freebsd" as NodeJS.Platform);
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable"], {
      home: makeCrewHome(),
      streams: c.streams,
    });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("autoupdate is not supported on freebsd");
  });

  test("unsupported scheduler status reports not loaded", () => {
    setAutoupdatePlatform("freebsd" as NodeJS.Platform);
    const home = makeCrewHome();
    const config = readConfig(home);
    writeConfig({ ...config, autoupdate: { enabled: true, interval_seconds: 14400 } }, home);
    const c = captureStreams();
    const code = runCli(["autoupdate", "status"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("background updater isn't loaded");
  });
});
