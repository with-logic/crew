/** Maintenance selection, lock ordering, and error release at the CLI boundary (§14). */

import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

const sourceCommands = [
  ["install", "./unused"],
  ["update"],
  ["upgrade"],
  ["update", "--dry-run"],
  ["outdated"],
  ["info", "unused"],
  ["search"],
  ["doctor"],
  ["doctor", "--repair"],
  ["cache", "clean"],
  ["cache", "clean", "--dry-run"],
  ["tap", "add", "./unused"],
  ["tap", "./unused"],
  ["tap", "update"],
];

test("C-CONC-05 source commands coordinate before creating state or reading sources", () => {
  const home = makeCrewHome();
  const lock = acquireLock(join(paths(home).locksDir, "maintenance"));
  const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
  try {
    for (const args of sourceCommands) {
      const output = captureStreams();
      expect(runCli([...args, "--json"], { home, streams: output.streams })).toBe(7);
      const error = JSON.parse(output.stdout()).error;
      expect(error.name).toBe("state_locked");
      expect(error.details.lockPath).toBe(join(paths(home).locksDir, "maintenance.lock"));
      expect(existsSync(paths(home).stateFile)).toBe(false);
      expect(existsSync(paths(home).stateLock)).toBe(false);
    }
    for (const args of [
      ["help"],
      ["version"],
      ["list"],
      ["tap", "list"],
      ["taps"],
      ["tap"],
      ["cache"],
    ]) {
      expect(runCli(args, { home, streams: captureStreams().streams })).toBe(0);
    }
    // These commands have no ephemeral source reads: their own validation still runs.
    expect(runCli(["tap", "remove"], { home, streams: captureStreams().streams })).toBe(4);
    expect(runCli(["uninstall"], { home, streams: captureStreams().streams })).toBe(4);
  } finally {
    lock.release();
    if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
    else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
  }
});

test("C-CONC-05 maintenance lock releases after handler errors and cache cleaning", () => {
  const home = makeCrewHome();
  const target = join(paths(home).locksDir, "maintenance");
  expect(runCli(["info"], { home, streams: captureStreams().streams })).toBe(4);
  expect(existsSync(`${target}.lock`)).toBe(false);
  expect(runCli(["cache", "clean"], { home, streams: captureStreams().streams })).toBe(0);
  expect(existsSync(target)).toBe(true);
  expect(existsSync(`${target}.lock`)).toBe(false);
  expect(existsSync(paths(home).cacheDir)).toBe(false);
});
