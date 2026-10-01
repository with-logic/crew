/**
 * Failed and freshly discovered scheduler repair output (§11.2, §5.2).
 */

import { describe, expect, test } from "bun:test";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { setEnabled, useSchedulerSeams } from "./helpers.ts";

useSchedulerSeams();

describe("scheduler repair diagnostics", () => {
  test("C-CLI-06 quiet mode retains sanitized platform failure on stderr", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    setLaunchctlRunner((args) => ({
      ok: false,
      stderr: args[0] === "list" ? "" : "Load failed: https://user:secret@example.com/repo\nforged",
    }));
    const c = captureStreams();
    expect(runCli(["doctor", "--repair", "--quiet"], { home, streams: c.streams })).toBe(1);
    expect(c.stdout()).toBe("");
    expect(c.stderr()).toContain("couldn't reconcile the background updater");
    expect(c.stderr()).toContain("Load failed");
    expect(c.stderr()).not.toContain("secret");
    expect(c.stderr()).not.toContain("\nforged");
    const j = captureStreams();
    expect(runCli(["doctor", "--repair", "--quiet", "--json"], { home, streams: j.streams })).toBe(
      1,
    );
    expect(JSON.parse(j.stdout()).repairs[0].code).toBe("autoupdate_repair_failed");
    expect(j.stderr()).toBe("");
  });

  test("C-STATE-11c fresh locked drift reports its failure after initially clean checks", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    setEnabled(home, true);
    let initiallyLoaded = true;
    setLaunchctlRunner((args) => {
      if (args[0] === "list") {
        const loaded = initiallyLoaded;
        initiallyLoaded = false;
        return loaded;
      }
      return { ok: false, stderr: "Load failed: scheduler unavailable" };
    });
    const c = captureStreams();
    expect(runCli(["doctor", "--repair"], { home, streams: c.streams })).toBe(1);
    expect(c.stdout()).toContain("1 repair failed");
    expect(c.stdout()).toContain("0 findings addressed");
    expect(c.stdout()).toContain("1 finding left for you");
    expect(c.stdout()).toContain("scheduler unavailable");
    expect(c.stdout()).not.toContain("Everything looks good");
  });
});
