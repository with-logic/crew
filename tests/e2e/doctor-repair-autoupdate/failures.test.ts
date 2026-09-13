/**
 * Failure and no-op paths for `crew doctor --repair`'s autoupdate
 * reconciliation (§11.2 check 7, C-STATE-11c/11d/11e, C-STATE-12).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { setEnabled, useSchedulerSeams } from "./helpers.ts";

useSchedulerSeams();

describe("C-STATE-11c a scheduler failure is a finding, not an abort", () => {
  test("launchd refuses to load: repair reported as failed, exit 1, other repairs still apply", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    // An orphan store entry alongside the drift proves the state repair
    // still ran after the scheduler step failed.
    const orphan = join(home, "store", "ghost@00000000");
    mkdirSync(orphan, { recursive: true });
    setLaunchctlRunner(() => false); // not loaded; bootstrap and load both fail
    const c = captureStreams();
    const code = runCli(["doctor", "--repair"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("1 repair failed");
    expect(c.stdout()).toContain("couldn't reconcile the background updater");
    expect(existsSync(orphan)).toBe(false);
    const j = captureStreams();
    setLaunchctlRunner(() => false);
    runCli(["doctor", "--repair", "--json"], { home, streams: j.streams });
    const repairs = JSON.parse(j.stdout()).repairs;
    expect(repairs).toHaveLength(1);
    expect(repairs[0].code).toBe("autoupdate_repair_failed");
    expect(repairs[0].level).toBe("error");
  });

  test("systemd failure: the platform's own diagnostic reaches the finding", () => {
    setAutoupdatePlatform("linux");
    const home = makeCrewHome();
    setEnabled(home, true);
    // The systemd seam carries stderr, so a failed repair must surface
    // the platform's explanation rather than a generic message — that
    // text is the only clue the user gets about why it failed.
    setSystemctlRunner((args) => ({
      ok: false,
      stderr: args[0] === "is-active" ? "" : "Failed to enable unit: Unit is masked.",
    }));
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const repairs = JSON.parse(c.stdout()).repairs;
    expect(repairs).toHaveLength(1);
    expect(repairs[0].code).toBe("autoupdate_repair_failed");
    expect(repairs[0].message).toContain("Unit is masked.");
  });
});

describe("C-STATE-11d a repair that did not take effect is not a success", () => {
  test("unload reported as done while the job is still loaded is a failure", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, false);
    // No plist on disk, but launchd still holds the job. Returning
    // early here reported a successful unload while it kept running.
    setLaunchctlRunner((args) => args[0] === "list");
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const repairs = JSON.parse(c.stdout()).repairs;
    expect(repairs).toHaveLength(1);
    expect(repairs[0].code).toBe("autoupdate_repair_failed");
    expect(repairs[0].level).toBe("error");
  });
});

describe("C-STATE-11d a load that silently did not take effect is a failure", () => {
  test("bootstrap claims success but the job is still not loaded", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    // launchctl exits 0 for `bootstrap` yet `list` still says the job
    // isn't there — the backend has nothing to throw about, so only the
    // post-repair state check can catch it.
    setLaunchctlRunner((args) => args[0] !== "list");
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const repairs = JSON.parse(c.stdout()).repairs;
    expect(repairs).toHaveLength(1);
    expect(repairs[0].code).toBe("autoupdate_repair_failed");
    expect(repairs[0].message).toContain("still reports it as not loaded");
  });
});

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

describe("C-STATE-11c launchctl diagnostics reach the repair result", () => {
  test("both fallback commands' distinct errors are reported, not just the first", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    // `enable` tries bootstrap then falls back to load. The fallback's
    // failure is the actionable one, so reporting only the first would
    // hide why the operation actually gave up.
    setLaunchctlRunner((args) => {
      if (args[0] === "list") return { ok: false, stderr: "" };
      if (args[0] === "bootstrap")
        return { ok: false, stderr: "Bootstrap failed: 5: Input/output error" };
      return { ok: false, stderr: "Load failed: 37: Operation already in progress" };
    });
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const repairs = JSON.parse(c.stdout()).repairs;
    expect(repairs[0].message).toContain("Bootstrap failed");
    expect(repairs[0].message).toContain("Operation already in progress");
  });
});

describe("C-STATE-11e repairs is a --repair-only field", () => {
  test("no drift means an empty repairs array on --repair", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setLaunchctlRunner(() => false); // disabled in config and not loaded
    const c = captureStreams();
    runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(JSON.parse(c.stdout())).toEqual({ findings: [], repairs: [], dry_run: false });
  });

  test("a plain run omits the field entirely", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setLaunchctlRunner(() => false);
    const c = captureStreams();
    runCli(["doctor", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed).toEqual({ findings: [], dry_run: false });
    expect("repairs" in parsed).toBe(false);
  });

  test("a dry run applies nothing, so it omits the field too", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    setLaunchctlRunner(() => false);
    const c = captureStreams();
    runCli(["doctor", "--repair", "--dry-run", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.dry_run).toBe(true);
    expect("repairs" in parsed).toBe(false);
  });

  test("an unparseable config still reports repairs, empty", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setLaunchctlRunner(() => false);
    // Repair is skipped because rebuilding taps from markers against a
    // config we couldn't read would discard the user's file. The field
    // must still appear: "the repair ran and fixed nothing" has to be
    // distinguishable from "this wasn't a repair run".
    writeFileSync(paths(home).configFile, "taps: [oops\n");
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--json"], { home, streams: c.streams });
    expect(code).toBe(1);
    const parsed = JSON.parse(c.stdout());
    expect(parsed.repairs).toEqual([]);
    expect(parsed.findings.some((f: { code: string }) => f.code === "config_invalid")).toBe(true);
  });
});

describe("C-STATE-12 doctor --repair --dry-run never touches the scheduler", () => {
  test("drift is listed but launchctl is only queried, never loaded", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    const calls: string[][] = [];
    setLaunchctlRunner((args) => {
      calls.push([...args]);
      return false;
    });
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("would address 1 finding");
    expect(calls.every((a) => a[0] === "list")).toBe(true);
    expect(existsSync(paths(home).autoupdatePlist)).toBe(false);
  });
});
