/**
 * Help entry for the `skills` alias. Implements PRD §5.1 and §14.
 */

import type { CommandHelp } from "./types.ts";

export const skillsHelp: CommandHelp = {
  name: "skills",
  synopsis: "crew skills",
  summary: [
    "Alias for `crew list`.",
    "Show everything you have installed: source, version, agents, and dependency/pin tags.",
  ],
  flags: [
    {
      flag: "--json",
      description: "Machine-readable output, same as `crew list --json`.",
    },
    {
      flag: "--scope {user,project}",
      description: "Only show system-wide or project-scoped installs (default: both).",
    },
  ],
  examples: [{ command: "crew skills", description: "See what's installed." }],
  seeAlso: ["list", "info", "search"],
};
