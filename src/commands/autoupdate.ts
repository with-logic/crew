/**
 * `crew autoupdate {enable|disable|status}` (§10.2).
 *
 * Human-friendly output: a single bold headline ("Autoupdate is on"
 * / "Autoupdate is off"), then a small metadata block — how often
 * crew checks, when it last ran — and a pointer to the log file
 * when relevant.
 */

import {
  disableAutoupdate,
  enableAutoupdate,
  isAutoupdateLoaded,
  readAutoupdateLogTail,
} from "../autoupdate/scheduler.ts";
import { DEFAULT_AUTOUPDATE_INTERVAL_SECONDS } from "../config/defaults.ts";
import { readConfig, writeConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { withStateLock } from "../state/lock.ts";
import { timeAgo, twoColumnTable } from "../util/format.ts";
import type { Styler } from "../util/term.ts";
import { showCommandHelp } from "./help/index.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function autoupdateCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (sub === "enable") return enable(ctx);
  if (sub === "disable") return disable(ctx);
  if (sub === "status") return status(ctx);
  // Bare `crew autoupdate` shows the help page. An unknown subcommand
  // is a user typo — error out with a hint.
  if (!sub) return showCommandHelp("autoupdate");
  throw new CrewError(
    "usage_error",
    `\`${sub}\` is not a \`crew autoupdate\` command.`,
    { sub },
    "Run `crew help autoupdate` to see the autoupdate commands.",
  );
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
    human: [
      `${ctx.style.symbol("ok")} ${ctx.style.bold("Autoupdate enabled")}`,
      ctx.style.dim(`  checking every ${formatInterval(seconds)}`),
      ctx.style.dim("  see progress in `crew autoupdate status`"),
    ],
    json: { enabled: true, interval_seconds: seconds },
  };
}

function disable(ctx: CommandContext): CommandOutput {
  withStateLock(() => {
    const config = readConfig(ctx.home);
    disableAutoupdate(ctx.home);
    writeConfig({ ...config, autoupdate: { ...config.autoupdate, enabled: false } }, ctx.home);
  }, ctx.home);
  return {
    exitCode: 0,
    human: [
      `${ctx.style.symbol("muted")} ${ctx.style.bold("Autoupdate disabled")}`,
      ctx.style.dim("  your skills won't update on their own anymore"),
      ctx.style.dim("  re-enable with `crew autoupdate enable`"),
    ],
    json: { enabled: false },
  };
}

function status(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const loaded = isAutoupdateLoaded();
  const tail = readAutoupdateLogTail(ctx.home);
  return {
    exitCode: 0,
    human: renderStatus(
      config.autoupdate.enabled,
      config.autoupdate.interval_seconds,
      loaded,
      tail.last_run,
      tail.last_exit_status,
      ctx.style,
    ),
    json: {
      enabled: config.autoupdate.enabled,
      interval_seconds: config.autoupdate.interval_seconds,
      scheduler_loaded: loaded,
      // Deprecated compatibility alias for pre-Linux status consumers.
      agent_loaded: loaded,
      last_run: tail.last_run,
      last_exit_status: tail.last_exit_status,
    },
  };
}

function renderStatus(
  enabled: boolean,
  intervalSeconds: number,
  loaded: boolean,
  lastRun: string | null,
  lastExitStatus: number | null,
  style: Styler,
): string[] {
  const lines: string[] = [];
  if (!enabled) {
    lines.push(`${style.symbol("muted")} ${style.bold("Autoupdate is off")}`);
    lines.push("");
    lines.push(style.dim("Turn it on with `crew autoupdate enable`."));
    return lines;
  }
  const headline = loaded
    ? `${style.symbol("ok")} ${style.bold("Autoupdate is on")}`
    : `${style.symbol("warn")} ${style.bold("Autoupdate is on, but the background updater isn't loaded")}`;
  lines.push(headline);
  lines.push("");
  const rows: [string, string][] = [];
  rows.push([style.dim("frequency"), `every ${formatInterval(intervalSeconds)}`]);
  rows.push([
    style.dim("last ran"),
    lastRun
      ? `${timeAgo(lastRun)} ${style.dim(`(${lastRun.slice(0, 10)})`)}`
      : style.dim("not yet"),
  ]);
  if (lastExitStatus !== null) rows.push([style.dim("last exit"), String(lastExitStatus)]);
  for (const line of twoColumnTable(rows, 2)) lines.push(`  ${line}`);
  lines.push("");
  if (loaded) {
    lines.push(style.dim("Logs: `~/.crew/logs/autoupdate.log`."));
  } else {
    lines.push(
      style.dim(
        "Reset with `crew autoupdate disable` then `crew autoupdate enable`, or `crew doctor --repair`.",
      ),
    );
  }
  return lines;
}

function formatInterval(seconds: number): string {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return d === 1 ? "day" : `${d} days`;
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "hour" : `${h} hours`;
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "minute" : `${m} minutes`;
  }
  return `${seconds} seconds`;
}

/** Parse `30s`, `5m`, `2h`, `1d` into seconds. */
export function parseDuration(raw: string): number {
  const m = raw.match(/^(\d+)([smhd])$/);
  if (!m) {
    throw new CrewError(
      "usage_error",
      `can't parse duration \`${raw}\` — expected a number followed by s/m/h/d, like \`30s\`, \`5m\`, \`2h\`, or \`1d\``,
      { raw },
    );
  }
  const n = Number.parseInt(m[1]!, 10);
  if (n === 0) {
    throw new CrewError("usage_error", "duration must be positive", { raw });
  }
  const unit = m[2] as "s" | "m" | "h" | "d";
  const scale = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return n * scale;
}
