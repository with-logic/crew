/**
 * `--dry-run` on the housekeeping commands (§5.2): `agents
 * enable|disable`, `autoupdate enable|disable`, `cache clean`, and
 * `doctor --repair`. Each test asserts the preview is reported AND that
 * nothing on disk changed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../src/autoupdate/launchd.ts";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { resetSystemctlRunner, setSystemctlRunner } from "../../src/autoupdate/systemd.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

describe("C-AGENT-09 agents enable/disable --dry-run", () => {
  test("enable reports the change and leaves config untouched", () => {
    const home = makeCrewHome();
    const before = readOrNull(paths(home).configFile);
    const c = captureStreams();
    const code = runCli(["agents", "enable", "codex", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would enable codex");
    expect(c.stdout()).toContain("dry run");
    expect(readOrNull(paths(home).configFile)).toBe(before);
    expect(readConfig(home).forced_agents).toEqual([]);
  });

  test("disable reports the change, --json carries dry_run, nothing written", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "disable", "codex", "--dry-run", "--json"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.stdout())).toEqual({ name: "codex", mode: "disable", dry_run: true });
    expect(readConfig(home).disabled_agents).toEqual([]);
  });

  test("unknown agent is still a usage error on a dry run", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "enable", "no-such", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("unknown agent");
  });

  test("a real enable reports dry_run: false in JSON", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["agents", "enable", "codex", "--json"], { home, streams: c.streams });
    expect(JSON.parse(c.stdout())).toEqual({ name: "codex", mode: "enable", dry_run: false });
    expect(readConfig(home).forced_agents).toEqual(["codex"]);
  });
});

describe("C-AUTO-11 autoupdate enable/disable --dry-run", () => {
  const savedLaunchAgentsDir = process.env["CREW_LAUNCH_AGENTS_DIR"];
  const savedSystemdDir = process.env["CREW_SYSTEMD_USER_DIR"];
  let schedulerCalls = 0;

  beforeEach(() => {
    process.env["CREW_LAUNCH_AGENTS_DIR"] = makeCrewHome();
    process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
    schedulerCalls = 0;
    setLaunchctlRunner(() => {
      schedulerCalls++;
      return true;
    });
    setSystemctlRunner(() => {
      schedulerCalls++;
      return { ok: true, stderr: "" };
    });
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

  test("macOS enable names the plist, calls no launchctl, writes nothing", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable", "--interval", "30m", "--dry-run"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would enable autoupdate");
    expect(c.stdout()).toContain("every 30 minutes");
    expect(c.stdout()).toContain("sh.crew.autoupdate.plist");
    expect(schedulerCalls).toBe(0);
    expect(existsSync(paths(home).autoupdatePlist)).toBe(false);
    expect(existsSync(paths(home).configFile)).toBe(false);
  });

  test("Linux enable --json lists both unit files with dry_run: true", () => {
    setAutoupdatePlatform("linux");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable", "--dry-run", "--json"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(c.stdout());
    expect(parsed.dry_run).toBe(true);
    expect(parsed.interval_seconds).toBe(14400);
    expect(parsed.artifacts).toEqual([
      paths(home).autoupdateSystemdService,
      paths(home).autoupdateSystemdTimer,
    ]);
    expect(schedulerCalls).toBe(0);
    expect(existsSync(paths(home).autoupdateSystemdTimer)).toBe(false);
  });

  test("disable --dry-run leaves an enabled scheduler in place", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    runCli(["autoupdate", "enable"], { home, streams: captureStreams().streams });
    const plist = readFileSync(paths(home).autoupdatePlist, "utf8");
    const config = readOrNull(paths(home).configFile);
    const callsAfterEnable = schedulerCalls;
    const c = captureStreams();
    const code = runCli(["autoupdate", "disable", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would disable autoupdate");
    expect(c.stdout()).toContain("would unload and remove");
    expect(schedulerCalls).toBe(callsAfterEnable);
    expect(readFileSync(paths(home).autoupdatePlist, "utf8")).toBe(plist);
    expect(readOrNull(paths(home).configFile)).toBe(config);
    expect(readConfig(home).autoupdate.enabled).toBe(true);
  });

  test("real enable/disable report dry_run: false in JSON", () => {
    setAutoupdatePlatform("darwin");
    const home = makeCrewHome();
    const on = captureStreams();
    runCli(["autoupdate", "enable", "--json"], { home, streams: on.streams });
    expect(JSON.parse(on.stdout()).dry_run).toBe(false);
    const off = captureStreams();
    runCli(["autoupdate", "disable", "--json"], { home, streams: off.streams });
    expect(JSON.parse(off.stdout())).toEqual({ enabled: false, dry_run: false });
  });

  test("unsupported platform still fails on a dry run", () => {
    setAutoupdatePlatform("win32");
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["autoupdate", "enable", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(8);
    expect(c.stderr()).toContain("not supported on win32");
  });
});

describe("C-STATE-13 cache clean --dry-run", () => {
  test("reports what would be freed and deletes nothing", () => {
    const home = makeCrewHome();
    const orphan = join(home, "store", "ghost@00000000");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "file.txt"), "x".repeat(4096));
    mkdirSync(join(home, "cache"), { recursive: true });
    writeFileSync(join(home, "cache", "blob"), "y".repeat(1024));
    const c = captureStreams();
    const code = runCli(["cache", "clean", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would clean cache (dry run)");
    expect(c.stdout()).toContain("5.0 KB would be freed");
    expect(c.stdout()).toContain("1 orphan");
    expect(existsSync(join(orphan, "file.txt"))).toBe(true);
    expect(existsSync(join(home, "cache", "blob"))).toBe(true);
  });

  test("--json carries the orphan list, byte count, and dry_run", () => {
    const home = makeCrewHome();
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "f"), "abc");
    const c = captureStreams();
    runCli(["cache", "clean", "--dry-run", "--json"], { home, streams: c.streams });
    expect(JSON.parse(c.stdout())).toEqual({
      removed_store: ["ghost@00000000"],
      freed_bytes: 3,
      dry_run: true,
    });
    expect(existsSync(join(home, "store", "ghost@00000000", "f"))).toBe(true);
  });

  test("fresh home says nothing to clean", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["cache", "clean", "--dry-run"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Nothing to clean");
  });
});

describe("C-STATE-12 doctor --repair --dry-run", () => {
  // Doctor asks the platform scheduler whether autoupdate is loaded;
  // pin it to "not loaded" so the dev machine's real launchd state
  // can't leak an extra finding into these assertions.
  beforeEach(() => {
    setAutoupdatePlatform("darwin");
    setLaunchctlRunner(() => false);
  });
  afterEach(() => {
    resetAutoupdatePlatform();
    resetLaunchctlRunner();
  });

  test("lists what a repair would address and changes nothing", () => {
    const home = makeCrewHome();
    const orphan = join(home, "store", "ghost@00000000");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "f"), "abc");
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--dry-run"], { home, streams: c.streams });
    // An orphan store entry is a warning, not an error, so exit 0 —
    // and nothing was repaired, so the orphan is still there.
    expect(code).toBe(0);
    expect(c.stdout()).toContain("would address 1 finding");
    expect(c.stdout()).toContain("Nothing was changed");
    expect(c.stdout()).not.toContain("Repaired what was fixable");
    expect(existsSync(join(orphan, "f"))).toBe(true);
    // The real repair removes it.
    runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });
    expect(existsSync(orphan)).toBe(false);
  });

  test("--json carries dry_run and the findings", () => {
    const home = makeCrewHome();
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    const c = captureStreams();
    runCli(["doctor", "--repair", "--dry-run", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.dry_run).toBe(true);
    expect(parsed.findings.some((f: { code: string }) => f.code === "orphan_store_entry")).toBe(
      true,
    );
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(true);
  });

  test("--dry-run without --repair is a plain check", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["doctor", "--dry-run", "--json"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(JSON.parse(c.stdout())).toEqual({ findings: [], dry_run: false });
  });
});
