/**
 * launchd agent management (§10.2).
 *
 * Writes and loads `~/Library/LaunchAgents/sh.crew.autoupdate.plist` that
 * invokes `crew update --quiet` on an interval. Uses `launchctl bootstrap`
 * when available, falling back to `launchctl load` on older macOS.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import { ensureDir, exists, rmrf, writeText } from "../util/fs.ts";
import { BUNDLE_IDENTIFIER, writeAttributionBundle } from "./bundle.ts";

/**
 * Plist body per §10.2, plus an `AssociatedBundleIdentifiers` key so
 * macOS Login Items attributes this agent to "Crew Skill Autoupdate"
 * rather than to the Bun binary's Apple Developer signer.
 */
export function plistXml(crewBinaryPath: string, intervalSeconds: number, logPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.crew.autoupdate</string>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>${BUNDLE_IDENTIFIER}</string>
  </array>
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

export interface EnableInput {
  readonly crewBinaryPath: string;
  readonly intervalSeconds: number;
  readonly home?: string;
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
    plistXml(input.crewBinaryPath, input.intervalSeconds, p.autoupdateLog),
  );
  if (!runLaunchctl(["bootstrap", `gui/${process.getuid?.() ?? 0}`, p.autoupdatePlist])) {
    if (!runLaunchctl(["load", p.autoupdatePlist])) {
      throw new CrewError("launchd_failure", "launchctl could not load the autoupdate agent");
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
 * invokes the real binary.
 */
export type LaunchctlRunner = (args: string[]) => boolean;
let launchctlRunner: LaunchctlRunner = (args) => {
  const proc = Bun.spawnSync({
    cmd: ["launchctl", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  return (proc.exitCode ?? -1) === 0;
};

export function setLaunchctlRunner(next: LaunchctlRunner): LaunchctlRunner {
  const prev = launchctlRunner;
  launchctlRunner = next;
  return prev;
}

export function resetLaunchctlRunner(): void {
  launchctlRunner = (args) => {
    const proc = Bun.spawnSync({
      cmd: ["launchctl", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return (proc.exitCode ?? -1) === 0;
  };
}

/** Read the last line of the autoupdate log (if any). */
export function readAutoupdateLogTail(home: string = crewHome()): {
  last_run: string | null;
  last_line: string | null;
} {
  const p = paths(home).autoupdateLog;
  if (!exists(p)) {
    return { last_run: null, last_line: null };
  }
  const contents = readFileSync(p, "utf8");
  const lines = contents.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { last_run: null, last_line: null };
  }
  return { last_run: null, last_line: lines[lines.length - 1]! };
}

function runLaunchctl(args: string[]): boolean {
  return launchctlRunner(args);
}
