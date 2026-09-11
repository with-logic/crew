/**
 * Help entry for the `ls` alias. Implements PRD §5.1.
 *
 * Flags are derived from `list`'s page — see `./alias.ts`.
 */

import { aliasHelp } from "./alias.ts";
import { listHelp } from "./list.ts";
import type { CommandHelp } from "./types.ts";

export const lsHelp: CommandHelp = aliasHelp(
  {
    name: "ls",
    synopsis: "crew ls",
    summary: [
      "Alias for `crew list`.",
      "Show everything you have installed: source, version, agents, and dependency/pin tags.",
    ],
    examples: [{ command: "crew ls", description: "See what's installed." }],
    seeAlso: ["list", "skills", "info"],
  },
  listHelp,
);
