import { describe, expect, test } from "bun:test";
import { plistXml, readAutoupdateLogTail } from "../../src/autoupdate/launchd.ts";
import { parseDuration } from "../../src/commands/autoupdate.ts";
import { CrewError } from "../../src/core/errors.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { paths } from "../../src/core/paths.ts";

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
    const xml = plistXml("/a&b/<c>d", 60, "/x");
    expect(xml).toContain("/a&amp;b/&lt;c&gt;d");
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
    expect(t).toEqual({ last_run: null, last_line: null });
  });
  test("returns last non-empty line", () => {
    const home = makeCrewHome();
    mkdirSync(paths(home).logsDir, { recursive: true });
    writeFileSync(paths(home).autoupdateLog, "first\nsecond\n\n");
    const t = readAutoupdateLogTail(home);
    expect(t.last_line).toBe("second");
  });
  test("empty log returns nulls", () => {
    const home = makeCrewHome();
    mkdirSync(paths(home).logsDir, { recursive: true });
    writeFileSync(paths(home).autoupdateLog, "");
    const t = readAutoupdateLogTail(home);
    expect(t.last_line).toBe(null);
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
    expect(c.stdout()).toContain("enabled: false");
  });
});
