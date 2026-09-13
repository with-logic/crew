/**
 * Help entry for the `remove` alias. Implements PRD §5.1.
 *
 * Flags are derived from `uninstall`'s page — see `./alias.ts`.
 */

import { aliasHelp } from "./alias.ts";
import type { CommandHelp } from "./types.ts";
import { uninstallHelp } from "./uninstall.ts";

export const removeHelp: CommandHelp = aliasHelp(
  {
    name: "remove",
    synopsis: "crew remove <name> [<name>...]",
    summary: [
      "Alias for `crew uninstall`.",
      "Remove an installed skill from every agent on your machine. Takes every flag `crew uninstall` takes.",
    ],
    examples: [
      { command: "crew remove python-testing", description: "Remove the skill from every agent." },
      {
        command: "crew remove --prune python-testing",
        description: "Remove it and anything it pulled in that's no longer needed.",
      },
    ],
    seeAlso: ["uninstall", "rm", "list"],
  },
  uninstallHelp,
);
