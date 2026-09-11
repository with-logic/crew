/**
 * Help entry for the `ls` alias. Implements PRD §5.1.
 */

import type { CommandHelp } from "./types.ts";

export const lsHelp: CommandHelp = {
  name: "ls",
  synopsis: "crew ls",
  summary: [
    "Alias for `crew list`.",
    "Show everything you have installed: source, version, agents, and dependency/pin tags.",
  ],
  flags: [
    {
      flag: "--json",
      description: "Machine-readable output, same as `crew list --json`.",
    },
  ],
  examples: [{ command: "crew ls", description: "See what's installed." }],
  seeAlso: ["list", "skills", "info"],
};
