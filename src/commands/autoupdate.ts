/**
 * `crew autoupdate {enable|disable|status}` (§10.2).
 */

import {
  disableAutoupdate,
  enableAutoupdate,
  isAutoupdateLoaded,
  readAutoupdateLogTail,
} from "../autoupdate/launchd.ts";
import { DEFAULT_AUTOUPDATE_INTERVAL_SECONDS } from "../config/defaults.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { withStateLock } from "../state/lock.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function autoupdateCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (sub === "enable") {
    return enable(ctx);
  }
  if (sub === "disable") {
    return disable(ctx);
  }
  if (sub === "status") {
    return status(ctx);
  }
  throw new CrewError("usage_error", "usage: crew autoupdate {enable|disable|status}");
}

function enable(ctx: CommandContext): CommandOutput {
  const intervalArg = ctx.flags.extras["interval"];
  const seconds = intervalArg
    ? parseDuration(String(intervalArg))
    : DEFAULT_AUTOUPDATE_INTERVAL_SECONDS;
  const crewBinaryPath = process.execPath; // bun or compiled binary

  withStateLock(() => {
    const config = readConfig(ctx.home);
    enableAutoupdate({ crewBinaryPath, intervalSeconds: seconds, home: ctx.home });
    writeConfig({ ...config, autoupdate: { enabled: true, interval_seconds: seconds } }, ctx.home);
  }, ctx.home);

  return {
    exitCode: 0,
    human: [`autoupdate enabled; interval=${seconds}s`],
    json: { enabled: true, interval_seconds: seconds },
  };
}

function disable(ctx: CommandContext): CommandOutput {
  withStateLock(() => {
    const config = readConfig(ctx.home);
    disableAutoupdate(ctx.home);
    writeConfig({ ...config, autoupdate: { ...config.autoupdate, enabled: false } }, ctx.home);
  }, ctx.home);
  return { exitCode: 0, human: ["autoupdate disabled"], json: { enabled: false } };
}

function status(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const loaded = isAutoupdateLoaded();
  const tail = readAutoupdateLogTail(ctx.home);
  const human = [
    `enabled: ${config.autoupdate.enabled}`,
    `interval_seconds: ${config.autoupdate.interval_seconds}`,
    `agent_loaded: ${loaded}`,
    `last_run: ${tail.last_run ?? "(unknown)"}`,
  ];
  return {
    exitCode: 0,
    human,
    json: {
      enabled: config.autoupdate.enabled,
      interval_seconds: config.autoupdate.interval_seconds,
      agent_loaded: loaded,
      last_run: tail.last_run,
    },
  };
}

/** Parse `30s`, `5m`, `2h`, `1d` into seconds. */
export function parseDuration(raw: string): number {
  const m = raw.match(/^(\d+)([smhd])$/);
  if (!m) {
    throw new CrewError("usage_error", `invalid duration: ${raw}`);
  }
  const n = Number.parseInt(m[1]!, 10);
  const unit = m[2] as "s" | "m" | "h" | "d";
  const scale = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return n * scale;
}
