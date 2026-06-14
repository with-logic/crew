/**
 * Autoupdate status rendering and JSON contract tests (§10.2, C-AUTO).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../src/autoupdate/launchd.ts";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const savedLaunchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];

beforeEach(() => {
  process.env["CREW_LAUNCH_AGENTS_DIR"] = makeCrewHome();
  setAutoupdatePlatform("darwin");
});

afterEach(() => {
  if (savedLaunchAgentsDir === undefined) delete process.env["CREW_LAUNCH_AGENTS_DIR"];
  else process.env["CREW_LAUNCH_AGENTS_DIR"] = savedLaunchAgentsDir;
  resetAutoupdatePlatform();
  resetLaunchctlRunner();
});

describe("autoupdate status", () => {
  test("shows loaded scheduler status after enabling", () => {
    const home = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "30m"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Autoupdate is on");
    expect(c.stdout()).toContain("every 30 minutes");
    expect(c.stdout()).toContain("not yet");
  });

  test("status --json reports scheduler_loaded with deprecated alias", () => {
    const home = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["autoupdate", "status", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      readonly agent_loaded: boolean;
      readonly scheduler_loaded: boolean;
    };
    expect(parsed.scheduler_loaded).toBe(true);
    expect(parsed.agent_loaded).toBe(true);
  });

  test("warns when enabled but scheduler isn't loaded", () => {
    const home = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    setLaunchctlRunner((args) => args[0] !== "list");
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home, streams: c.streams });
    expect(c.stdout()).toContain("background updater isn't loaded");
    expect(c.stdout()).toContain("crew autoupdate disable");
  });

  test("formats day intervals and recent log lines", () => {
    const home = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "2d"], {
      home,
      streams: captureStreams().streams,
    });
    const p = paths(home);
    mkdirSync(p.logsDir, { recursive: true });
    writeFileSync(p.autoupdateLog, `${new Date().toISOString()} ran\n`);
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home, streams: c.streams });
    expect(c.stdout()).toContain("every 2 days");
    expect(c.stdout()).toContain("last ran");
  });

  test("formats singular day interval", () => {
    const home = makeCrewHome();
    setLaunchctlRunner(() => true);
    runCli(["autoupdate", "enable", "--interval", "1d"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["autoupdate", "status"], { home, streams: c.streams });
    expect(c.stdout()).toContain("every day");
  });
});
