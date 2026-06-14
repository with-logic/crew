/**
 * systemd user timer management (§10.2).
 *
 * Writes `sh.crew.autoupdate.service` and `.timer` under the user's
 * systemd unit directory, then enables the timer with `systemctl --user`.
 */

import { dirname } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import { atomicReplace, ensureDir, exists, rmrf, writeText } from "../util/fs.ts";
import type { EnableInput } from "./types.ts";

export interface SystemctlResult {
  readonly ok: boolean;
  readonly stderr: string;
}

/** systemd service unit per §10.2. */
export function serviceUnit(crewBinaryPath: string, logPath: string, home: string): string {
  return `[Unit]
Description=Homecrew Skill Autoupdate

[Service]
Type=oneshot
Environment=${quoteEnv("CREW_HOME", home)}
Environment=CREW_AUTOUPDATE_LOG=1
ExecStart=${quoteArg(crewBinaryPath)} update --quiet
StandardOutput=${quoteArg(`append:${logPath}`)}
StandardError=${quoteArg(`append:${logPath}`)}
`;
}

/** systemd timer unit per §10.2. */
export function timerUnit(intervalSeconds: number): string {
  return `[Unit]
Description=Run Homecrew Skill Autoupdate

[Timer]
OnBootSec=${intervalSeconds}s
OnUnitActiveSec=${intervalSeconds}s
Unit=sh.crew.autoupdate.service
Persistent=true

[Install]
WantedBy=timers.target
`;
}

/** Write the unit files and enable the user timer. */
export function enableAutoupdate(input: EnableInput): void {
  const home = input.home ?? crewHome();
  const p = paths(home);
  ensureDir(p.logsDir);
  ensureDir(dirname(p.autoupdateSystemdService));
  writeUnitAtomic(
    p.autoupdateSystemdService,
    serviceUnit(input.crewBinaryPath, p.autoupdateLog, home),
  );
  writeUnitAtomic(p.autoupdateSystemdTimer, timerUnit(input.intervalSeconds));
  const reload = runSystemctl(["daemon-reload"]);
  if (!reload.ok) {
    cleanupFailedEnable(home);
    throw systemdFailure("reload systemd user units", reload.stderr);
  }
  const enable = runSystemctl(["enable", "--now", "sh.crew.autoupdate.timer"]);
  if (!enable.ok) {
    cleanupFailedEnable(home);
    throw systemdFailure("enable the autoupdate timer", enable.stderr);
  }
}

/**
 * Disable the timer and remove unit files.
 *
 * If the post-removal daemon-reload fails, callers keep config enabled
 * and surface the error; `doctor --repair` owns that drift recovery.
 */
export function disableAutoupdate(home: string = crewHome()): void {
  const p = paths(home);
  const hadUnits = exists(p.autoupdateSystemdService) || exists(p.autoupdateSystemdTimer);
  if (!hadUnits) return;
  const disable = runSystemctl(["disable", "--now", "sh.crew.autoupdate.timer"]);
  if (!disable.ok) {
    throw systemdFailure("disable the autoupdate timer", disable.stderr);
  }
  rmrf(p.autoupdateSystemdService);
  rmrf(p.autoupdateSystemdTimer);
  const reload = runSystemctl(["daemon-reload"]);
  if (!reload.ok) {
    throw systemdFailure("reload systemd user units", reload.stderr);
  }
}

/** Is the timer currently active? */
export function isAutoupdateLoaded(): boolean {
  return runSystemctl(["is-active", "--quiet", "sh.crew.autoupdate.timer"]).ok;
}

export type SystemctlRunner = (args: string[]) => SystemctlResult;

function defaultRunner(args: string[]): SystemctlResult {
  try {
    const proc = Bun.spawnSync({
      cmd: ["systemctl", "--user", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      ok: (proc.exitCode ?? -1) === 0,
      stderr: new TextDecoder().decode(proc.stderr).trim(),
    };
  } catch (err) {
    // `Bun.spawnSync` throws only when the process boundary itself fails.
    return { ok: false, stderr: (err as Error).message };
  }
}

let systemctlRunner: SystemctlRunner = defaultRunner;

export function setSystemctlRunner(next: SystemctlRunner): SystemctlRunner {
  const prev = systemctlRunner;
  systemctlRunner = next;
  return prev;
}

export function resetSystemctlRunner(): void {
  systemctlRunner = defaultRunner;
}

function quoteEnv(key: string, value: string): string {
  return quoteArg(`${key}=${value}`);
}

/**
 * Quote systemd command/env values for unit files.
 *
 * A conservative bare-word set stays unquoted. Quoted values double `%`
 * so systemd does not treat user paths as specifiers, escape backslash
 * and quote characters, and reject newlines because unit directives are
 * line-oriented.
 */
function quoteArg(value: string): string {
  if (/[\n\r]/.test(value)) {
    throw new CrewError("autoupdate_failure", "systemd unit values cannot contain newlines");
  }
  if (/^[A-Za-z0-9_/@+=:,.-]+$/.test(value)) return value;
  return `"${value.replace(/%/g, "%%").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function cleanupFailedEnable(home: string): void {
  const p = paths(home);
  rmrf(p.autoupdateSystemdService);
  rmrf(p.autoupdateSystemdTimer);
  runSystemctl(["daemon-reload"]);
}

function writeUnitAtomic(path: string, contents: string): void {
  const tmp = `${path}.tmp`;
  writeText(tmp, contents);
  atomicReplace(tmp, path);
}

function systemdFailure(action: string, stderr: string): CrewError {
  const detail = boundedStderr(stderr);
  const suffix = detail ? ` systemctl stderr: ${detail}` : "";
  const message = `systemctl --user couldn't ${action}; make sure systemd user services are available. Check \`systemctl --user status sh.crew.autoupdate.timer\` and \`journalctl --user -u sh.crew.autoupdate.service\` for details. On headless sessions, you may need \`loginctl enable-linger\`.${suffix}`;
  if (!detail) return new CrewError("autoupdate_failure", message);
  return new CrewError("autoupdate_failure", message, { stderr: detail });
}

function boundedStderr(stderr: string): string {
  const trimmed = stderr.trim();
  return trimmed.length > 600 ? `${trimmed.slice(0, 600)}...` : trimmed;
}

function runSystemctl(args: string[]): SystemctlResult {
  return systemctlRunner(args);
}
