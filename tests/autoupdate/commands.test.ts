import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bundlePath } from "../../src/autoupdate/bundle.ts";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../src/autoupdate/launchd.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

// Redirect the LaunchAgents dir so tests never touch the real
// `~/Library/LaunchAgents/`. `paths()` reads this env var on every
// call, so setting it per-test is sufficient.
const savedLaunchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];

beforeEach(() => {
  process.env["CREW_LAUNCH_AGENTS_DIR"] = makeCrewHome();
});

afterEach(() => {
  if (savedLaunchAgentsDir === undefined) {
    delete process.env["CREW_LAUNCH_AGENTS_DIR"];
  } else {
    process.env["CREW_LAUNCH_AGENTS_DIR"] = savedLaunchAgentsDir;
  }
  resetLaunchctlRunner();
});

describe("autoupdate commands", () => {
  test("C-AUTO-01/03 enable writes plist and loads agent", () => {
    const crewHome = makeCrewHome();
    const loadedArgs: string[][] = [];
    setLaunchctlRunner((args) => {
      loadedArgs.push([...args]);
      // First call is `bootstrap` — succeed.
      return true;
    });
    const code = runCli(["autoupdate", "enable"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const plistPath = paths(crewHome).autoupdatePlist;
    expect(existsSync(plistPath)).toBe(true);
    const config = readConfig(crewHome);
    expect(config.autoupdate.enabled).toBe(true);
    expect(config.autoupdate.interval_seconds).toBe(14400);
    expect(loadedArgs.some((a) => a[0] === "bootstrap")).toBe(true);
  });

  test("enable writes the attribution bundle so Login Items shows 'Crew Skill Autoupdate'", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    const infoPlistPath = join(bundlePath(crewHome), "Contents", "Info.plist");
    expect(existsSync(infoPlistPath)).toBe(true);
    const infoPlist = readFileSync(infoPlistPath, "utf8");
    expect(infoPlist).toContain("<string>Crew Skill Autoupdate</string>");
    expect(infoPlist).toContain("<string>sh.crew.autoupdater</string>");

    // The launchd plist must also reference the bundle identifier.
    const plist = readFileSync(paths(crewHome).autoupdatePlist, "utf8");
    expect(plist).toContain("<key>AssociatedBundleIdentifiers</key>");
    expect(plist).toContain("<string>sh.crew.autoupdater</string>");
  });

  test("C-AUTO-06 enable fails when launchctl fails", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => false);
    const code = runCli(["autoupdate", "enable"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(code).toBe(8);
  });

  test("fallback to `load` when `bootstrap` fails", () => {
    const crewHome = makeCrewHome();
    const calls: string[][] = [];
    setLaunchctlRunner((args) => {
      calls.push([...args]);
      return args[0] === "load"; // only load succeeds
    });
    const code = runCli(["autoupdate", "enable"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(calls.some((a) => a[0] === "load")).toBe(true);
  });

  test("C-AUTO-04 disable unloads and removes plist", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    const plistPath = paths(crewHome).autoupdatePlist;
    expect(existsSync(plistPath)).toBe(true);
    const code = runCli(["autoupdate", "disable"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(plistPath)).toBe(false);
    expect(readConfig(crewHome).autoupdate.enabled).toBe(false);
  });

  test("disable when not enabled is no-op", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    const code = runCli(["autoupdate", "disable"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });

  test("C-AUTO-08 --interval 30s", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "30s"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(readConfig(crewHome).autoupdate.interval_seconds).toBe(30);
  });

  test("status shows `Autoupdate is on` after enabling", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "30m"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home: crewHome, streams: c.streams });
    expect(c.stdout()).toContain("Autoupdate is on");
    expect(c.stdout()).toContain("every 30 minutes");
    expect(c.stdout()).toContain("not yet");
  });

  test("status when enabled but agent isn't loaded shows a warning hint", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    // Flip the runner to say "not loaded" for the status check.
    setLaunchctlRunner((args) => args[0] !== "list");
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home: crewHome, streams: c.streams });
    expect(c.stdout()).toContain("background agent isn't loaded");
    expect(c.stdout()).toContain("crew autoupdate disable");
  });

  test("status with --interval 1d reports `every day`", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "1d"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home: crewHome, streams: c.streams });
    expect(c.stdout()).toContain("every day");
  });

  test("status with --interval 2d reports `every 2 days`", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "2d"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home: crewHome, streams: c.streams });
    expect(c.stdout()).toContain("every 2 days");
  });

  test("status with a recent log line shows time-ago", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    // Inject a log line so readAutoupdateLogTail has something to surface.
    const fs = require("node:fs") as typeof import("node:fs");
    const { paths } =
      require("../../src/core/paths.ts") as typeof import("../../src/core/paths.ts");
    fs.mkdirSync(paths(crewHome).logsDir, { recursive: true });
    const nowIso = new Date().toISOString();
    fs.writeFileSync(paths(crewHome).autoupdateLog, `${nowIso} ran\n`);
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home: crewHome, streams: c.streams });
    expect(c.stdout()).toContain("Autoupdate is on");
    expect(c.stdout()).toContain("last ran");
  });

  test("unknown autoupdate subcommand errors", () => {
    const crewHome = makeCrewHome();
    const code = runCli(["autoupdate", "frob"], {
      home: crewHome,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });
});
