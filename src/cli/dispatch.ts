/**
 * CLI dispatcher.
 *
 * Maps a parsed subcommand to its handler, executes, and returns the
 * `CommandOutput`. Unknown commands produce `usage_error`.
 */

import { agentsCommand } from "../commands/agents.ts";
import { autoupdateCommand } from "../commands/autoupdate.ts";
import { cacheCommand } from "../commands/cache.ts";
import { doctorCommand } from "../commands/doctor/index.ts";
import { helpCommand, versionCommand } from "../commands/help/index.ts";
import { infoCommand } from "../commands/info/index.ts";
import { installCommand } from "../commands/install/index.ts";
import { listCommand } from "../commands/list.ts";
import { searchCommand } from "../commands/search/index.ts";
import { selfUpdateCommand } from "../commands/self-update.ts";
import { tapCommand } from "../commands/tap/index.ts";
import type { CommandContext, CommandOutput } from "../commands/types.ts";
import { uninstallCommand } from "../commands/uninstall/index.ts";
import { updateCommand } from "../commands/update/index.ts";
import { CrewError } from "../core/errors.ts";

export type CommandHandler = (ctx: CommandContext) => CommandOutput;

export const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  install: installCommand,
  uninstall: uninstallCommand,
  update: updateCommand,
  list: listCommand,
  search: searchCommand,
  info: infoCommand,
  tap: tapCommand,
  agents: agentsCommand,
  autoupdate: autoupdateCommand,
  doctor: doctorCommand,
  cache: cacheCommand,
  "self-update": selfUpdateCommand,
  help: helpCommand,
  version: versionCommand,
};

type CommandAlias = readonly [canonical: string, ...positionalPrefix: string[]];

const COMMAND_ALIASES: Record<string, CommandAlias> = {
  skills: ["list"],
  taps: ["tap", "list"],
};

/** Dispatch a command name to its handler, returning the result. */
export function dispatch(command: string, ctx: CommandContext): CommandOutput {
  const alias = COMMAND_ALIASES[command];
  const canonical = alias?.[0] ?? command;
  const positionalPrefix = alias?.slice(1) ?? [];
  const aliasCtx =
    positionalPrefix.length === 0
      ? ctx
      : { ...ctx, positional: [...positionalPrefix, ...ctx.positional] };
  const handler = COMMAND_HANDLERS[canonical];
  if (!handler) {
    throw new CrewError(
      "usage_error",
      `\`${command}\` is not a crew command.`,
      { command },
      "Run `crew help` to see what Homecrew can do.",
    );
  }
  return handler(aliasCtx);
}
