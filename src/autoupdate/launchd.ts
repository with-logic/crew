/**
 * launchd agent management (§10.2).
 *
 * Writes and loads `~/Library/LaunchAgents/sh.crew.autoupdate.plist` that
 * invokes `crew update --quiet` on an interval. Uses `launchctl bootstrap`
 * when available, falling back to `launchctl load` on older macOS.
 */

import { dirname } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import { ensureDir, exists, rmrf, writeText } from "../util/fs.ts";
import { BUNDLE_IDENTIFIER, writeAttributionBundle } from "./bundle.ts";
import type { EnableInput } from "./types.ts";

/**
 * Plist body per §10.2, plus an `AssociatedBundleIdentifiers` key so
 * macOS Login Items attributes this agent to "Homecrew Skill Autoupdate"
 * rather than to the Bun binary's Apple Developer signer.
 */
export function plistXml(
  crewBinaryPath: string,
  intervalSeconds: number,
  logPath: string,
  home: string = crewHome(),
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.crew.autoupdate</string>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>${BUNDLE_IDENTIFIER}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CREW_HOME</key><string>${escapeXml(home)}</string>
    <key>CREW_AUTOUPDATE_LOG</key><string>1</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(crewBinaryPath)}</string>
    <string>update</string>
    <string>--quiet</string>
  </array>
  <key>StartInterval</key><integer>${intervalSeconds}</integer>
  <key>StandardOutPath</key><string>${escapeXml(logPath)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(logPath)}</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Write the attribution bundle + plist and (attempt to) load the agent. */
export function enableAutoupdate(input: EnableInput): void {
  const home = input.home ?? crewHome();
  const p = paths(home);
  ensureDir(p.logsDir);
  ensureDir(dirname(p.autoupdatePlist));
  // Write the attribution bundle first so the plist's
  // `AssociatedBundleIdentifiers` resolves as soon as launchd loads it.
  writeAttributionBundle(home);
  writeText(
    p.autoupdatePlist,
    plistXml(input.crewBinaryPath, input.intervalSeconds, p.autoupdateLog, home),
  );
  const bootstrapped = runLaunchctl([
    "bootstrap",
    `gui/${process.getuid?.() ?? 0}`,
    p.autoupdatePlist,
  ]);
  if (!bootstrapped.ok) {
    const loaded = runLaunchctl(["load", p.autoupdatePlist]);
    if (!loaded.ok) {
      throw new CrewError("autoupdate_failure", loadFailureMessage(bootstrapped, loaded));
    }
  }
}

/** The launchctl diagnostic, when we have one, else the generic hint. */
function launchctlDetail(...results: readonly LaunchctlResult[]): string {
  for (const r of results) {
    if (r.stderr.length > 0) return r.stderr;
  }
  return "check `log show --predicate 'subsystem == \"com.apple.xpc.launchd\"' --last 5m` for details";
}

function loadFailureMessage(...results: readonly LaunchctlResult[]): string {
  return `launchctl refused to load the autoupdate agent — ${launchctlDetail(...results)}`;
}

/**
 * Unload the agent and delete its plist. The unload is attempted even
 * when the plist is already gone: launchd can still hold a loaded job
 * whose file was removed out from under it, and returning early there
 * would report a successful disable while the updater kept running.
 */
export function disableAutoupdate(home: string = crewHome()): void {
  const p = paths(home);
  const booted = runLaunchctl(["bootout", `gui/${process.getuid?.() ?? 0}/sh.crew.autoupdate`]);
  const plistExists = exists(p.autoupdatePlist);
  const unloaded: LaunchctlResult = plistExists
    ? runLaunchctl(["unload", p.autoupdatePlist])
    : { ok: false, stderr: "" };
  if (plistExists) rmrf(p.autoupdatePlist);
  // Either command succeeding means the job is gone. Both failing while
  // the agent is still loaded is a real failure, not a no-op.
  if (!(booted.ok || unloaded.ok) && isAutoupdateLoaded()) {
    throw new CrewError(
      "autoupdate_failure",
      `launchctl refused to unload the autoupdate agent — ${launchctlDetail(booted, unloaded)}`,
    );
  }
}

/** Is the agent currently loaded? */
export function isAutoupdateLoaded(): boolean {
  return runLaunchctl(["list", "sh.crew.autoupdate"]).ok;
}

/**
 * Test seam for `launchctl`. Replace with a stub in tests; the default
 * invokes the real binary on macOS. On any platform where `launchctl`
 * isn't available (e.g. Linux CI runners), `Bun.spawnSync` throws
 * `ENOENT` — we catch and report failure, which is the right answer
 * ("agent is not loaded") for a platform that can't load it in the
 * first place.
 *
 * The runner returns stderr as well as the status so a failed repair
 * can name the platform error (§11.2). A stub may return a bare
 * boolean; `runLaunchctl` normalizes both shapes.
 */
export interface LaunchctlResult {
  readonly ok: boolean;
  readonly stderr: string;
}
export type LaunchctlRunner = (args: string[]) => boolean | LaunchctlResult;

/** launchctl's diagnostics are short; cap them so an error stays readable. */
const MAX_STDERR = 500;

function defaultRunner(args: string[]): LaunchctlResult {
  try {
    const proc = Bun.spawnSync({
      cmd: ["launchctl", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      ok: (proc.exitCode ?? -1) === 0,
      stderr: (proc.stderr?.toString() ?? "").trim().slice(0, MAX_STDERR),
    };
  } catch {
    return { ok: false, stderr: "" };
  }
}
let launchctlRunner: LaunchctlRunner = defaultRunner;

export function setLaunchctlRunner(next: LaunchctlRunner): LaunchctlRunner {
  const prev = launchctlRunner;
  launchctlRunner = next;
  return prev;
}

export function resetLaunchctlRunner(): void {
  launchctlRunner = defaultRunner;
}

/**
 * Normalize the seam's two accepted shapes into a result. A stub that
 * returns a bare boolean carries no diagnostic, which is why the
 * platform-error tests drive the systemd seam.
 */
function runLaunchctl(args: string[]): LaunchctlResult {
  const r = launchctlRunner(args);
  return typeof r === "boolean" ? { ok: r, stderr: "" } : r;
}
