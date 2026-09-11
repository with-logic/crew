/**
 * `crew autoupdate {enable|disable|status}` (§10.2).
 *
 * `enable` writes the platform scheduler files and loads them;
 * `disable` unloads and removes them; both flip `autoupdate.enabled`
 * in config. With `--dry-run`, enable/disable describe the scheduler
 * files they would touch and the interval, and change nothing — no
 * launchctl/systemctl call, no config write.
 *
 * Status rendering lives in `./render.ts`; interval parsing and
 * formatting in `./duration.ts`.
 */

import {
  autoupdateArtifacts,
  disableAutoupdate,
  enableAutoupdate,
  isAutoupdateLoaded,
  readAutoupdateLogTail,
} from "../../autoupdate/scheduler.ts";
import { DEFAULT_AUTOUPDATE_INTERVAL_SECONDS } from "../../config/defaults.ts";
import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { withStateLock } from "../../state/lock.ts";
import { shortenHome } from "../../util/format.ts";
import { showCommandHelp } from "../help/index.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { formatInterval, parseDuration } from "./duration.ts";
import { renderStatus } from "./render.ts";

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

  if (ctx.flags.dryRun) {
    const artifacts = autoupdateArtifacts(ctx.home);
    return {
      exitCode: 0,
      human: [
        `${ctx.style.symbol("ok")} ${ctx.style.bold("Would enable autoupdate")} ${ctx.style.dim("(dry run)")}`,
        ctx.style.dim(`  checking every ${formatInterval(seconds)}`),
        ...artifacts.map((a) => ctx.style.dim(`  would write and load ${shortenHome(a)}`)),
        ctx.style.dim("  nothing was changed"),
      ],
      json: { enabled: true, interval_seconds: seconds, artifacts, dry_run: true },
    };
  }

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
    json: { enabled: true, interval_seconds: seconds, dry_run: false },
  };
}

function disable(ctx: CommandContext): CommandOutput {
  if (ctx.flags.dryRun) {
    const artifacts = autoupdateArtifacts(ctx.home);
    return {
      exitCode: 0,
      human: [
        `${ctx.style.symbol("muted")} ${ctx.style.bold("Would disable autoupdate")} ${ctx.style.dim("(dry run)")}`,
        ...artifacts.map((a) => ctx.style.dim(`  would unload and remove ${shortenHome(a)}`)),
        ctx.style.dim("  nothing was changed"),
      ],
      json: { enabled: false, artifacts, dry_run: true },
    };
  }

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
    json: { enabled: false, dry_run: false },
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
