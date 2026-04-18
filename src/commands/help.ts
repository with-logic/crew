/**
 * `crew help [<command>]` and `crew version`.
 */

import { CREW_VERSION } from "../core/version.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

const COMMAND_HELP: Record<string, string[]> = {
  install: ["crew install <ref> [<ref>...]", "Install one or more skills into every detected target."],
  uninstall: ["crew uninstall <name> [<name>...]", "Remove installed skills from all targets."],
  update: ["crew update [<name>...]", "Update all installed skills, or only those named."],
  list: ["crew list", "List installed skills."],
  search: ["crew search <query>", "Search across configured taps."],
  info: ["crew info <ref-or-name>", "Show details for an installed or searchable skill."],
  tap: [
    "crew tap add <git-url> [<name>]  Add a registry.",
    "crew tap remove <name>           Remove a registry.",
    "crew tap list                    List configured registries.",
  ],
  targets: [
    "crew targets                     List detected agent coders.",
    "crew targets enable <name>       Force-enable an otherwise-undetected target.",
    "crew targets disable <name>      Skip this target on install/update.",
  ],
  autoupdate: [
    "crew autoupdate enable [--interval <dur>]  Install the launchd agent (default 4h).",
    "crew autoupdate disable                     Remove the launchd agent.",
    "crew autoupdate status                      Show active state and last run.",
  ],
  doctor: ["crew doctor [--verify] [--repair]", "Check and optionally repair integrity."],
  cache: ["crew cache clean", "Remove ephemeral caches and unreferenced store entries."],
};

export function helpCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (!sub) return overview();
  const lines = COMMAND_HELP[sub];
  if (!lines) return overview();
  return { exitCode: 0, human: lines, json: { command: sub, lines } };
}

export function versionCommand(_ctx: CommandContext): CommandOutput {
  return { exitCode: 0, human: [`crew ${CREW_VERSION}`], json: { version: CREW_VERSION } };
}

function overview(): CommandOutput {
  const lines: string[] = [`crew ${CREW_VERSION} — package manager for Agent Skills`, ""];
  for (const [name, entries] of Object.entries(COMMAND_HELP)) {
    lines.push(`  ${name.padEnd(10)} — ${entries[0]}`);
  }
  lines.push("");
  lines.push("Run `crew help <command>` for details.");
  return { exitCode: 0, human: lines };
}
