/** Scheduler fixture isolation preserves configured and absent directories (§11.2 check 7). */

import { expect, test } from "bun:test";
import { redirectSchedulerDirectories } from "./helpers.ts";

test("scheduler fixtures restore previously configured directories", () => {
  const restoreOriginal = redirectSchedulerDirectories();
  try {
    const launchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];
    const systemdDir = process.env["CREW_SYSTEMD_USER_DIR"];
    const restore = redirectSchedulerDirectories();
    expect(process.env["CREW_LAUNCH_AGENTS_DIR"]).not.toBe(launchAgentsDir);
    expect(process.env["CREW_SYSTEMD_USER_DIR"]).not.toBe(systemdDir);
    restore();
    expect(process.env["CREW_LAUNCH_AGENTS_DIR"]).toBe(launchAgentsDir);
    expect(process.env["CREW_SYSTEMD_USER_DIR"]).toBe(systemdDir);
  } finally {
    restoreOriginal();
  }
});

test("scheduler fixtures restore absent directory keys without stringifying undefined", () => {
  const restoreOriginal = redirectSchedulerDirectories();
  try {
    delete process.env["CREW_LAUNCH_AGENTS_DIR"];
    delete process.env["CREW_SYSTEMD_USER_DIR"];
    const restore = redirectSchedulerDirectories();
    expect(process.env["CREW_LAUNCH_AGENTS_DIR"]).toBeString();
    expect(process.env["CREW_SYSTEMD_USER_DIR"]).toBeString();
    restore();
    expect(Object.hasOwn(process.env, "CREW_LAUNCH_AGENTS_DIR")).toBe(false);
    expect(Object.hasOwn(process.env, "CREW_SYSTEMD_USER_DIR")).toBe(false);
  } finally {
    restoreOriginal();
  }
});
