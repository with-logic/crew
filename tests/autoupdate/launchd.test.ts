import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  isAutoupdateLoaded,
  plistXml,
  readAutoupdateLogTail,
  resetLaunchctlRunner,
} from "../../src/autoupdate/launchd.ts";
import { parseDuration } from "../../src/commands/autoupdate.ts";
import { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import { makeCrewHome } from "../helpers/env.ts";

describe("plistXml", () => {
  test("C-AUTO-01/02 contains required keys", () => {
    const xml = plistXml("/usr/local/bin/crew", 14400, "/tmp/crew.log");
    expect(xml).toContain("<string>sh.crew.autoupdate</string>");
    expect(xml).toContain("<string>update</string>");
    expect(xml).toContain("<string>--quiet</string>");
    expect(xml).toContain("<integer>14400</integer>");
    expect(xml).toContain("<string>/usr/local/bin/crew</string>");
    expect(xml).toContain("<string>/tmp/crew.log</string>");
    expect(xml).toContain("<false/>");
  });
  test("escapes XML special characters in paths", () => {
    const xml = plistXml("/a&b/<c>d", 60, "/x", "/home&/<crew>");
    expect(xml).toContain("/a&amp;b/&lt;c&gt;d");
    expect(xml).toContain("/home&amp;/&lt;crew&gt;");
  });
  test("pins scheduled runs to the same CREW_HOME used at enable time", () => {
    const xml = plistXml("/usr/local/bin/crew", 14400, "/tmp/crew.log", "/tmp/crew-home");
    expect(xml).toContain("<key>EnvironmentVariables</key>");
    expect(xml).toContain("<key>CREW_HOME</key><string>/tmp/crew-home</string>");
    expect(xml).toContain("<key>CREW_AUTOUPDATE_LOG</key><string>1</string>");
  });
});

describe("parseDuration", () => {
  test("C-AUTO-08 accepts 30s, 5m, 2h, 1d", () => {
    expect(parseDuration("30s")).toBe(30);
    expect(parseDuration("5m")).toBe(300);
    expect(parseDuration("2h")).toBe(7200);
    expect(parseDuration("1d")).toBe(86400);
  });
  test("rejects garbage", () => {
    expect(() => parseDuration("")).toThrow(CrewError);
    expect(() => parseDuration("5x")).toThrow(CrewError);
    expect(() => parseDuration("abc")).toThrow(CrewError);
  });
});

describe("readAutoupdateLogTail", () => {
  test("missing log returns nulls", () => {
    const home = makeCrewHome();
    const t = readAutoupdateLogTail(home);
    expect(t).toEqual({ last_run: null, last_exit_status: null, last_line: null });
  });
  test("returns last non-empty line", () => {
    const home = makeCrewHome();
    mkdirSync(paths(home).logsDir, { recursive: true });
    writeFileSync(paths(home).autoupdateLog, "first\nsecond\n\n");
    const t = readAutoupdateLogTail(home);
    expect(t.last_line).toBe("second");
    expect(t.last_run).toBe(null);
    expect(t.last_exit_status).toBe(null);
  });
  test("parses scheduled update status lines", () => {
    const home = makeCrewHome();
    mkdirSync(paths(home).logsDir, { recursive: true });
    writeFileSync(paths(home).autoupdateLog, "crew-autoupdate 2026-04-20T10:00:00.000Z exit=1\n");
    const t = readAutoupdateLogTail(home);
    expect(t.last_run).toBe("2026-04-20T10:00:00.000Z");
    expect(t.last_exit_status).toBe(1);
  });
  test("empty log returns nulls", () => {
    const home = makeCrewHome();
    mkdirSync(paths(home).logsDir, { recursive: true });
    writeFileSync(paths(home).autoupdateLog, "");
    const t = readAutoupdateLogTail(home);
    expect(t.last_line).toBe(null);
    expect(t.last_exit_status).toBe(null);
  });
});

describe("default launchctl runner", () => {
  // Exercise both branches of the real default runner:
  //   - the try body (spawn returns a boolean) fires on platforms
  //     that have launchctl (macOS);
  //   - the catch body (ENOENT from a missing binary) fires on
  //     platforms that don't, OR when we force it by stubbing Bun.spawnSync.
  afterEach(() => resetLaunchctlRunner());

  test("runner returns a boolean for a harmless query", () => {
    expect(typeof isAutoupdateLoaded()).toBe("boolean");
  });

  test("runner catches spawn errors and returns false", () => {
    const original = Bun.spawnSync;
    (Bun as unknown as { spawnSync: typeof Bun.spawnSync }).spawnSync = () => {
      throw new Error("simulated ENOENT");
    };
    try {
      expect(isAutoupdateLoaded()).toBe(false);
    } finally {
      (Bun as unknown as { spawnSync: typeof Bun.spawnSync }).spawnSync = original;
    }
  });
});

describe("autoupdate command (status only — enable/disable require real launchctl)", () => {
  test("crew autoupdate status shows defaults", async () => {
    const { runCli } = await import("../../src/cli/main.ts");
    const { captureStreams } = await import("../helpers/env.ts");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "status"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Autoupdate is off");
  });
});
