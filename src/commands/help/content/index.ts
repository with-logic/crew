/**
 * Aggregates every per-command help entry plus the overview-level
 * registries (GROUPS, ONELINERS). One file per command lives here so
 * edits to help copy never touch rendering logic or unrelated commands.
 */

import { agentsHelp } from "./agents.ts";
import { autoupdateHelp } from "./autoupdate.ts";
import { cacheHelp } from "./cache.ts";
import { doctorHelp } from "./doctor.ts";
import { helpHelp } from "./help.ts";
import { infoHelp } from "./info.ts";
import { installHelp } from "./install.ts";
import { listHelp } from "./list.ts";
import { searchHelp } from "./search.ts";
import { selfUpdateHelp } from "./self-update.ts";
import { tapHelp } from "./tap.ts";
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
  { title: "Agents & automation", commands: ["agents", "autoupdate"] },
  { title: "Housekeeping", commands: ["doctor", "cache", "self-update"] },
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
  agents: agentsHelp,
  autoupdate: autoupdateHelp,
  doctor: doctorHelp,
  cache: cacheHelp,
  "self-update": selfUpdateHelp,
  help: helpHelp,
  version: versionHelp,
};

/** Summary one-liners used in the overview, keyed by command name. */
export const ONELINERS: Record<string, string> = {
  install: "Install a skill everywhere at once.",
  uninstall: "Remove a skill (use --prune to tidy up leftovers).",
  update: "Catch installed skills up to the latest.",
  list: "See what you have installed.",
  info: "Get the details on a skill.",
  search: "Look for a skill by name or description.",
  tap: "Manage the collections you install from.",
  agents: "See or adjust which agent coders Homecrew touches.",
  autoupdate: "Keep skills up to date in the background.",
  doctor: "Check Homecrew's health; fix what's fixable.",
  cache: "Free up disk space.",
  "self-update": "Upgrade the `crew` binary itself.",
  help: "Get help on any command.",
  version: "Print the version.",
};
