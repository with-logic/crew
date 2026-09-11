/**
 * Aggregates every per-command help entry plus the overview-level
 * registries (GROUPS, ONELINERS). One file per command lives here so
 * edits to help copy never touch rendering logic or unrelated commands.
 */

import type { VisibleCommand } from "../../../cli/aliases.ts";
import { lookup } from "../../../util/registry.ts";
import { agentsHelp } from "./agents.ts";
import { autoupdateHelp } from "./autoupdate.ts";
import { cacheHelp } from "./cache.ts";
import { doctorHelp } from "./doctor.ts";
import { helpHelp } from "./help.ts";
import { infoHelp } from "./info.ts";
import { installHelp } from "./install.ts";
import { listHelp } from "./list.ts";
import { lsHelp } from "./ls.ts";
import { outdatedHelp } from "./outdated.ts";
import { removeHelp } from "./remove.ts";
import { rmHelp } from "./rm.ts";
import { searchHelp } from "./search.ts";
import { selfUpdateHelp } from "./self-update.ts";
import { skillsHelp } from "./skills.ts";
import { tapHelp } from "./tap.ts";
import { tapsHelp } from "./taps.ts";
import type { CommandHelp } from "./types.ts";
import { uninstallHelp } from "./uninstall.ts";
import { untapHelp } from "./untap.ts";
import { updateHelp } from "./update.ts";
import { upgradeHelp } from "./upgrade.ts";
import { versionHelp } from "./version.ts";

export type { CommandHelp, HelpSection } from "./types.ts";

/**
 * How commands are grouped in the overview.
 *
 * `commands` is `VisibleCommand[]` rather than `string[]` so a typo or a
 * command that no longer exists is a compile error. §5.5 also requires
 * every command to appear in exactly one group; `tests/e2e/help.test.ts`
 * asserts that, since types alone can't catch an omission or a repeat.
 */
export interface CommandGroup {
  readonly title: string;
  readonly commands: readonly VisibleCommand[];
}

export const GROUPS: readonly CommandGroup[] = [
  {
    title: "Managing skills",
    commands: [
      "install",
      "uninstall",
      "remove",
      "rm",
      "update",
      "upgrade",
      "outdated",
      "list",
      "skills",
      "ls",
      "info",
    ],
  },
  { title: "Discovery", commands: ["search", "tap", "taps", "untap"] },
  { title: "Agents & automation", commands: ["agents", "autoupdate"] },
  { title: "Housekeeping", commands: ["doctor", "cache", "self-update"] },
  { title: "Meta", commands: ["help", "version"] },
];

/**
 * Every command word the user can type maps to exactly one help page.
 * Typed as `Record<VisibleCommand, …>` (not `Record<string, …>`) so
 * adding an alias to `COMMAND_ALIASES` without a help page is a
 * compile error rather than a silent fallback to the overview.
 */
export const COMMANDS: Record<VisibleCommand, CommandHelp> = {
  install: installHelp,
  uninstall: uninstallHelp,
  remove: removeHelp,
  rm: rmHelp,
  update: updateHelp,
  upgrade: upgradeHelp,
  outdated: outdatedHelp,
  list: listHelp,
  skills: skillsHelp,
  ls: lsHelp,
  info: infoHelp,
  search: searchHelp,
  tap: tapHelp,
  taps: tapsHelp,
  untap: untapHelp,
  agents: agentsHelp,
  autoupdate: autoupdateHelp,
  doctor: doctorHelp,
  cache: cacheHelp,
  "self-update": selfUpdateHelp,
  help: helpHelp,
  version: versionHelp,
};

/**
 * Summary one-liners used in the overview, keyed by command name.
 * Exhaustive over `VisibleCommand` for the same reason as `COMMANDS`.
 */
export const ONELINERS: Record<VisibleCommand, string> = {
  install: "Install a skill everywhere at once.",
  uninstall: "Remove a skill (use --prune to tidy up leftovers).",
  remove: "Alias for `uninstall`.",
  rm: "Alias for `uninstall`.",
  update: "Catch installed skills up to the latest.",
  upgrade: "Alias for `update`.",
  outdated: "See which skills have updates available.",
  list: "See what you have installed.",
  skills: "Alias for `list`.",
  ls: "Alias for `list`.",
  info: "Get the details on a skill.",
  search: "Look for a skill by name or description.",
  tap: "Manage the collections you install from.",
  taps: "Alias for `tap list`.",
  untap: "Alias for `tap remove`.",
  agents: "See or adjust which agent coders Homecrew touches.",
  autoupdate: "Keep skills up to date in the background.",
  doctor: "Check Homecrew's health; fix what's fixable.",
  cache: "Free up disk space.",
  "self-update": "Upgrade the `crew` binary itself.",
  help: "Get help on any command.",
  version: "Print the version.",
};

/**
 * Look up a help page by a user-typed word; undefined when it isn't a
 * command.
 *
 * `Object.hasOwn` guards the lookup — the word comes from argv, and a
 * plain object resolves inherited members, so `crew help __proto__`
 * would otherwise return a prototype value and crash the renderer
 * instead of falling back to the overview.
 */
export function helpFor(command: string): CommandHelp | undefined {
  return lookup(COMMANDS, command);
}

/** The overview blurb for a command word, or "" when it has none. */
export function onelinerFor(command: string): string {
  return lookup(ONELINERS, command) ?? "";
}
