/**
 * `--verbose` coverage for the platform schedulers (§5.2, C-CLI-06a).
 *
 * `autoupdate enable` shells out to `launchctl` on macOS and
 * `systemctl --user` on Linux. Both render a progress line; these
 * tests drive each through the CLI with the platform and runner seams
 * so the rendered command is asserted on a machine of either kind.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../src/autoupdate/launchd.ts";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner, setSystemctlRunner } from "../../src/autoupdate/systemd.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const savedLaunchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];
const savedSystemdDir = process.env["CREW_SYSTEMD_USER_DIR"];

beforeEach(() => {
  process.env["CREW_LAUNCH_AGENTS_DIR"] = makeCrewHome();
  process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
});

afterEach(() => {
  restoreEnv("CREW_LAUNCH_AGENTS_DIR", savedLaunchAgentsDir);
  restoreEnv("CREW_SYSTEMD_USER_DIR", savedSystemdDir);
  resetAutoupdatePlatform();
  resetLaunchctlRunner();
  resetSystemctlRunner();
});

function restoreEnv(key: string, saved: string | undefined): void {
  if (saved === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = saved;
}

describe("--verbose scheduler commands", () => {
  test("C-CLI-06a launchctl invocations are reported", () => {
    setAutoupdatePlatform("darwin");
    setLaunchctlRunner(() => true);
    const capture = captureStreams();
    const code = runCli(["autoupdate", "enable", "--verbose"], {
      home: makeCrewHome(),
      streams: capture.streams,
    });
    expect(code).toBe(0);
    expect(capture.stderr()).toContain("crew: $ launchctl ");
  });

  test("C-CLI-06a systemctl invocations are reported", () => {
    setAutoupdatePlatform("linux");
    setSystemctlRunner(() => ({ ok: true, stderr: "" }));
    const capture = captureStreams();
    const code = runCli(["autoupdate", "enable", "--verbose"], {
      home: makeCrewHome(),
      streams: capture.streams,
    });
    expect(code).toBe(0);
    expect(capture.stderr()).toContain("crew: $ systemctl --user ");
  });
});
