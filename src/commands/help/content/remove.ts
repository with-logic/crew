/**
 * Help entry for the `remove` alias. Implements PRD §5.1.
 */

import type { CommandHelp } from "./types.ts";

export const removeHelp: CommandHelp = {
  name: "remove",
  synopsis: "crew remove <name> [<name>...]",
  summary: [
    "Alias for `crew uninstall`.",
    "Remove an installed skill from every agent on your machine. Takes every flag `crew uninstall` takes.",
  ],
  flags: [
    {
      flag: "--prune",
      description: "Also clean up dependencies that are no longer needed.",
    },
    {
      flag: "--agent <name>",
      description: "Only remove from the named agent(s). Repeatable.",
    },
  ],
  examples: [
    { command: "crew remove python-testing", description: "Remove the skill from every agent." },
    {
      command: "crew remove --prune python-testing",
      description: "Remove it and anything it pulled in that's no longer needed.",
    },
  ],
  seeAlso: ["uninstall", "rm", "list"],
};
