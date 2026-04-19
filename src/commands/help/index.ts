/**
 * `crew help [<command>]` and `crew version`.
 *
 * Help for a CLI that users type from memory has two jobs:
 *
 *   1. Orient someone who typed `crew` with no idea what it does.
 *   2. Answer "how do I do X" for someone who knows crew roughly but
 *      forgot the exact flag.
 *
 * Content lives under `./content/`; rendering in `./render.ts`.
 * This file is the command-dispatch entry point only.
 */

import { CREW_VERSION } from "../../core/version.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { COMMANDS } from "./content/index.ts";
import { overview, renderCommand } from "./render.ts";

/** Entry point for the `help` command. */
export function helpCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (!sub) {
    return overview();
  }
  const help = COMMANDS[sub];
  if (!help) {
    return overview();
  }
  return renderCommand(help);
}

/** Entry point for the `version` command. */
export function versionCommand(_ctx: CommandContext): CommandOutput {
  return { exitCode: 0, human: [`crew ${CREW_VERSION}`], json: { version: CREW_VERSION } };
}
