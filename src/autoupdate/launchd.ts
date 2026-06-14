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
  if (!runLaunchctl(["bootstrap", `gui/${process.getuid?.() ?? 0}`, p.autoupdatePlist])) {
    if (!runLaunchctl(["load", p.autoupdatePlist])) {
      throw new CrewError(
        "autoupdate_failure",
        "launchctl refused to load the autoupdate agent — check `log show --predicate 'subsystem == \"com.apple.xpc.launchd\"' --last 5m` for details",
      );
    }
  }
}

/** Unload the plist and delete it. */
export function disableAutoupdate(home: string = crewHome()): void {
  const p = paths(home);
  if (exists(p.autoupdatePlist)) {
    runLaunchctl(["bootout", `gui/${process.getuid?.() ?? 0}/sh.crew.autoupdate`]);
    runLaunchctl(["unload", p.autoupdatePlist]);
    rmrf(p.autoupdatePlist);
  }
}

/** Is the agent currently loaded? */
export function isAutoupdateLoaded(): boolean {
  return runLaunchctl(["list", "sh.crew.autoupdate"]);
}

/**
 * Test seam for `launchctl`. Replace with a stub in tests; the default
 * invokes the real binary on macOS. On any platform where `launchctl`
 * isn't available (e.g. Linux CI runners), `Bun.spawnSync` throws
 * `ENOENT` — we catch and return `false`, which is the right answer
 * ("agent is not loaded") for a platform that can't load it in the
 * first place.
 */
export type LaunchctlRunner = (args: string[]) => boolean;
function defaultRunner(args: string[]): boolean {
  try {
    const proc = Bun.spawnSync({
      cmd: ["launchctl", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return (proc.exitCode ?? -1) === 0;
  } catch {
    return false;
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

function runLaunchctl(args: string[]): boolean {
  return launchctlRunner(args);
}
