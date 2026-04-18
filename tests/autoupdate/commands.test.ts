import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import {
  resetLaunchctlRunner,
  setLaunchctlRunner,
} from "../../src/autoupdate/launchd.ts";
import { readConfig } from "../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

// launchctl writes to ~/Library/LaunchAgents — we redirect by setting
// HOME. But since `paths()` reads homedir() at import time... actually
// paths() does it on every call, so we can set process.env.HOME before.
const realHome = homedir();
let fakeHome: string;

beforeEach(() => {
  fakeHome = makeCrewHome();
  process.env.HOME = fakeHome;
});

afterEach(() => {
  process.env.HOME = realHome;
  resetLaunchctlRunner();
});

describe("autoupdate commands", () => {
  test("C-AUTO-01/03 enable writes plist and loads agent", () => {
    const crewHome = makeCrewHome();
    let loadedArgs: string[][] = [];
    setLaunchctlRunner((args) => {
      loadedArgs.push([...args]);
      // First call is `bootstrap` — succeed.
      return true;
    });
    const code = runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    expect(code).toBe(0);
    const plistPath = paths(crewHome).autoupdatePlist;
    expect(existsSync(plistPath)).toBe(true);
    const config = readConfig(crewHome);
    expect(config.autoupdate.enabled).toBe(true);
    expect(config.autoupdate.interval_seconds).toBe(14400);
    expect(loadedArgs.some((a) => a[0] === "bootstrap")).toBe(true);
  });

  test("C-AUTO-06 enable fails when launchctl fails", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => false);
    const code = runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    expect(code).toBe(8);
  });

  test("fallback to `load` when `bootstrap` fails", () => {
    const crewHome = makeCrewHome();
    let calls: string[][] = [];
    setLaunchctlRunner((args) => {
      calls.push([...args]);
      return args[0] === "load"; // only load succeeds
    });
    const code = runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(calls.some((a) => a[0] === "load")).toBe(true);
  });

  test("C-AUTO-04 disable unloads and removes plist", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home: crewHome, streams: captureStreams().streams });
    const plistPath = paths(crewHome).autoupdatePlist;
    expect(existsSync(plistPath)).toBe(true);
    const code = runCli(["autoupdate", "disable"], { home: crewHome, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(plistPath)).toBe(false);
    expect(readConfig(crewHome).autoupdate.enabled).toBe(false);
  });

  test("disable when not enabled is no-op", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    const code = runCli(["autoupdate", "disable"], { home: crewHome, streams: captureStreams().streams });
    expect(code).toBe(0);
  });

  test("C-AUTO-08 --interval 30s", () => {
    const crewHome = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "30s"], { home: crewHome, streams: captureStreams().streams });
    expect(readConfig(crewHome).autoupdate.interval_seconds).toBe(30);
  });

  test("unknown autoupdate subcommand errors", () => {
    const crewHome = makeCrewHome();
    const code = runCli(["autoupdate", "frob"], { home: crewHome, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});
