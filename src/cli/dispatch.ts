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
import { lookup } from "../util/registry.ts";
import { aliasFor, type CanonicalCommand } from "./aliases.ts";

export type CommandHandler = (ctx: CommandContext) => CommandOutput;

/**
 * Every canonical command's handler. Typed as `Record<CanonicalCommand,
 * …>` so adding a command to `CanonicalCommand` without a handler — or
 * a handler for a word that isn't canonical — is a compile error rather
 * than a runtime "not a crew command".
 */
export const COMMAND_HANDLERS: Record<CanonicalCommand, CommandHandler> = {
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

/** Dispatch a command name to its handler, returning the result. */
export function dispatch(command: string, ctx: CommandContext): CommandOutput {
  const alias = aliasFor(command);
  const canonical = alias?.[0] ?? command;
  const positionalPrefix = alias?.slice(1) ?? [];
  const aliasCtx =
    positionalPrefix.length === 0
      ? ctx
      : { ...ctx, positional: [...positionalPrefix, ...ctx.positional] };
  const handler = lookup(COMMAND_HANDLERS, canonical);
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
