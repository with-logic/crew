/**
 * Aggregates every per-command help entry plus the overview-level
 * registries (GROUPS, ONELINERS). One file per command lives here so
 * edits to help copy never touch rendering logic or unrelated commands.
 */

import { autoupdateHelp } from "./autoupdate.ts";
import { cacheHelp } from "./cache.ts";
import { doctorHelp } from "./doctor.ts";
import { helpHelp } from "./help.ts";
import { infoHelp } from "./info.ts";
import { installHelp } from "./install.ts";
import { listHelp } from "./list.ts";
import { searchHelp } from "./search.ts";
import { tapHelp } from "./tap.ts";
import { targetsHelp } from "./targets.ts";
import type { CommandHelp } from "./types.ts";
import { uninstallHelp } from "./uninstall.ts";
import { updateHelp } from "./update.ts";
import { versionHelp } from "./version.ts";

export type { CommandHelp, HelpSection } from "./types.ts";

/** How commands are grouped in the overview. */
export interface CommandGroup {
  readonly title: string;
  readonly commands: readonly string[];
}

export const GROUPS: readonly CommandGroup[] = [
  { title: "Managing skills", commands: ["install", "uninstall", "update", "list", "info"] },
  { title: "Discovery", commands: ["search", "tap"] },
  { title: "Agents & automation", commands: ["targets", "autoupdate"] },
  { title: "Housekeeping", commands: ["doctor", "cache"] },
  { title: "Meta", commands: ["help", "version"] },
];

export const COMMANDS: Record<string, CommandHelp> = {
  install: installHelp,
  uninstall: uninstallHelp,
  update: updateHelp,
  list: listHelp,
  info: infoHelp,
  search: searchHelp,
  tap: tapHelp,
  targets: targetsHelp,
  autoupdate: autoupdateHelp,
  doctor: doctorHelp,
  cache: cacheHelp,
  help: helpHelp,
  version: versionHelp,
};

/** Summary one-liners used in the overview, keyed by command name. */
export const ONELINERS: Record<string, string> = {
  install: "Install skills into every detected agent.",
  uninstall: "Remove installed skills (with --prune for orphans).",
  update: "Update skills to their latest revision.",
  list: "Show installed skills.",
  info: "Show details for a skill (installed or not).",
  search: "Search across configured taps.",
  tap: "Manage registries (default: core).",
  targets: "List or toggle agent coders crew installs into.",
  autoupdate: "Schedule `crew update` in the background.",
  doctor: "Audit and optionally repair state.",
  cache: "Clean ephemeral caches and orphaned store entries.",
  help: "Show help for crew or a specific command.",
  version: "Print the version.",
};
