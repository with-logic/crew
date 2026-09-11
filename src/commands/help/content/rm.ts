/**
 * Help entry for the `rm` alias. Implements PRD §5.1.
 *
 * Flags are derived from `uninstall`'s page — see `./alias.ts`.
 */

import { aliasHelp } from "./alias.ts";
import type { CommandHelp } from "./types.ts";
import { uninstallHelp } from "./uninstall.ts";

export const rmHelp: CommandHelp = aliasHelp(
  {
    name: "rm",
    synopsis: "crew rm <name> [<name>...]",
    summary: [
      "Alias for `crew uninstall`.",
      "Remove an installed skill from every agent on your machine. Takes every flag `crew uninstall` takes.",
    ],
    examples: [
      { command: "crew rm python-testing", description: "Remove the skill from every agent." },
      {
        command: "crew rm --agent codex python-testing",
        description: "Remove it from Codex only.",
      },
    ],
    seeAlso: ["uninstall", "remove", "list"],
  },
  uninstallHelp,
);
