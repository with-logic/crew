/**
 * Focused systemd failure rendering coverage (§10.2, C-AUTO).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner, setSystemctlRunner } from "../../src/autoupdate/systemd.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

afterEach(() => {
  resetAutoupdatePlatform();
  resetSystemctlRunner();
});

describe("systemd failure rendering", () => {
  test("empty systemctl stderr omits the stderr detail suffix", () => {
    setAutoupdatePlatform("linux");
    setSystemctlRunner((args) => ({
      ok: args[0] !== "enable",
      stderr: "",
    }));
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable"], {
      home: makeCrewHome(),
      streams: c.streams,
    });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("systemctl --user couldn't enable the autoupdate timer");
    expect(c.stderr()).not.toContain("systemctl stderr:");
  });

  test("long systemctl stderr is bounded", () => {
    setAutoupdatePlatform("linux");
    setSystemctlRunner((args) => ({
      ok: args[0] !== "enable",
      stderr: "x".repeat(650),
    }));
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable"], {
      home: makeCrewHome(),
      streams: c.streams,
    });
    expect(code).toBe(8);
    expect(c.stderr()).toContain(`${"x".repeat(600)}...`);
    expect(c.stderr()).not.toContain("x".repeat(601));
  });
});
