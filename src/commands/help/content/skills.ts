/**
 * Help entry for the `skills` alias. Implements PRD §5.1 and §14.
 *
 * Flags are derived from `list`'s page — see `./alias.ts`.
 */

import { aliasHelp } from "./alias.ts";
import { listHelp } from "./list.ts";
import type { CommandHelp } from "./types.ts";

export const skillsHelp: CommandHelp = aliasHelp(
  {
    name: "skills",
    synopsis: "crew skills",
    summary: [
      "Alias for `crew list`.",
      "Show everything you have installed: source, version, agents, and dependency/pin tags.",
    ],
    examples: [{ command: "crew skills", description: "See what's installed." }],
    seeAlso: ["list", "info", "search"],
  },
  listHelp,
);
