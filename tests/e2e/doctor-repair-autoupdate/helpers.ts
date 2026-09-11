/**
 * Shared fixtures for the `crew doctor --repair` autoupdate-drift tests
 * (§11.2 check 7). Both platform backends are driven through their
 * runner seams; no real launchctl or systemctl is ever invoked.
 */

import { afterEach, beforeEach } from "bun:test";
import { resetLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import { resetAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner } from "../../../src/autoupdate/systemd.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";

const savedLaunchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];
const savedSystemdDir = process.env["CREW_SYSTEMD_USER_DIR"];

/**
 * Redirect both platforms' unit directories at a scratch home and undo
 * every seam afterwards. Imported for side effects by each test file.
 */
export function useSchedulerSeams(): void {
  beforeEach(() => {
    process.env["CREW_LAUNCH_AGENTS_DIR"] = makeCrewHome();
    process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
  });

  afterEach(() => {
    if (savedLaunchAgentsDir === undefined) delete process.env["CREW_LAUNCH_AGENTS_DIR"];
    else process.env["CREW_LAUNCH_AGENTS_DIR"] = savedLaunchAgentsDir;
    if (savedSystemdDir === undefined) delete process.env["CREW_SYSTEMD_USER_DIR"];
    else process.env["CREW_SYSTEMD_USER_DIR"] = savedSystemdDir;
    resetAutoupdatePlatform();
    resetLaunchctlRunner();
    resetSystemctlRunner();
  });
}

/** Write `autoupdate.enabled` (and its interval) into the config. */
export function setEnabled(home: string, enabled: boolean, intervalSeconds = 900): void {
  const config = readConfig(home);
  writeConfig({ ...config, autoupdate: { enabled, interval_seconds: intervalSeconds } }, home);
}

/**
 * A launchctl stub that models the job's loaded state instead of
 * answering `list` with a constant. Repair verifies the scheduler's
 * real state after acting, so a constant stub would describe a load
 * that silently failed.
 */
export function statefulLaunchctl(
  startLoaded: boolean,
  calls: string[][],
): (args: string[]) => boolean {
  let loaded = startLoaded;
  return (args: string[]) => {
    calls.push([...args]);
    if (args[0] === "list") return loaded;
    if (args[0] === "bootstrap") {
      loaded = true;
      return true;
    }
    if (args[0] === "bootout") {
      loaded = false;
      return true;
    }
    return true;
  };
}
