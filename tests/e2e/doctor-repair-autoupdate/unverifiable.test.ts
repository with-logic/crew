/**
 * Unverifiable-repair paths for `crew doctor --repair`'s autoupdate
 * reconciliation (§11.2 check 7, C-STATE-11f): a repair whose confirming probe cannot
 * run is not claimed as done.
 */

import { describe, expect, test } from "bun:test";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { setEnabled, useSchedulerSeams } from "./helpers.ts";

useSchedulerSeams();

describe("C-STATE-11f an unverifiable repair is not a success", () => {
  test("launchd: the confirming probe fails, so the unload is not claimed as done", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, false);
    // Detection must see the job as loaded (that is the drift), and the
    // unload must succeed. Only the probe that would CONFIRM the unload
    // fails — it answers nothing about the job, so reporting
    // `autoupdate_unloaded` would claim a postcondition never checked.
    // A bare `ok: false` would be a real "not loaded"; the stderr is
    // what makes it indeterminate.
    // The probe runs during detection AND again to confirm the unload.
    // Only the confirming one fails, so this keys off the unload having
    // happened rather than a call count, which would silently drift if
    // detection changed how often it asks.
    let unloaded = false;
    setLaunchctlRunner((args) => {
      if (args[0] !== "list") {
        unloaded = true;
        return { ok: true, stderr: "" };
      }
      return unloaded
        ? { ok: false, stderr: "launchctl: Could not connect to the service" }
        : { ok: true, stderr: "" }; // detection: the job is loaded
    });
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const repairs = JSON.parse(c.stdout()).repairs;
    expect(repairs).toHaveLength(1);
    expect(repairs[0].code).toBe("autoupdate_repair_failed");
    expect(repairs[0].message).toContain("couldn't confirm the scheduler's state");
    expect(repairs[0].message).toContain("Could not connect to the service");
  });

  test("systemd: same, with the platform's own diagnostic", () => {
    setAutoupdatePlatform("linux");
    const home = makeCrewHome();
    setEnabled(home, false);
    let disabled = false;
    setSystemctlRunner((args) => {
      if (args[0] !== "is-active") {
        disabled = true;
        return { ok: true, stderr: "" };
      }
      return disabled
        ? { ok: false, stderr: "Failed to connect to bus: No such file or directory" }
        : { ok: true, stderr: "" }; // detection: the timer is active
    });
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const repairs = JSON.parse(c.stdout()).repairs;
    expect(repairs[0].code).toBe("autoupdate_repair_failed");
    expect(repairs[0].message).toContain("Failed to connect to bus");
  });
});
