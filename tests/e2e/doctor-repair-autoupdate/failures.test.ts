/**
 * Failure and no-op paths for `crew doctor --repair`'s autoupdate
 * reconciliation (§11.2 check 7, C-STATE-11c/11d): scheduler errors and repairs that
 * did not take effect.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { setSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { runCli } from "../../../src/cli/main.ts";
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
