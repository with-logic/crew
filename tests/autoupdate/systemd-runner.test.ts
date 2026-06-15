/**
 * Default systemctl runner coverage (§10.2, C-AUTO).
 *
 * The main systemd command tests use the runner seam; this file covers the
 * production runner's process-boundary behavior.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  enableAutoupdate,
  isAutoupdateLoaded,
  resetSystemctlRunner,
} from "../../src/autoupdate/systemd.ts";
import { makeCrewHome } from "../helpers/env.ts";

const original = Bun.spawnSync;
const savedSystemdDir = process.env["CREW_SYSTEMD_USER_DIR"];
type SpawnSync = typeof Bun.spawnSync;

function setSpawnSync(next: SpawnSync): void {
  (Bun as unknown as { spawnSync: SpawnSync }).spawnSync = next;
}

afterEach(() => {
  setSpawnSync(original);
  if (savedSystemdDir === undefined) delete process.env["CREW_SYSTEMD_USER_DIR"];
  else process.env["CREW_SYSTEMD_USER_DIR"] = savedSystemdDir;
  resetSystemctlRunner();
});

describe("systemd runner defaults", () => {
  test("default runner returns true for zero exit", () => {
    setSpawnSync(() => ({ exitCode: 0, stderr: new Uint8Array() }) as ReturnType<SpawnSync>);
    expect(isAutoupdateLoaded()).toBe(true);
  });

  test("default runner catches missing systemctl", () => {
    setSpawnSync(() => {
      throw new Error("ENOENT");
    });
    expect(isAutoupdateLoaded()).toBe(false);
  });

  test("default runner preserves stderr on nonzero exit", () => {
    process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
    setSpawnSync(
      () =>
        ({
          exitCode: 1,
          stderr: new TextEncoder().encode("no user bus"),
        }) as ReturnType<SpawnSync>,
    );
    expect(() =>
      enableAutoupdate({ crewBinaryPath: "/tmp/crew", intervalSeconds: 60, home: makeCrewHome() }),
    ).toThrow(/no user bus/);
  });
});
