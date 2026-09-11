/**
 * Help entry for the `rm` alias. Implements PRD §5.1.
 */

import type { CommandHelp } from "./types.ts";

export const rmHelp: CommandHelp = {
  name: "rm",
  synopsis: "crew rm <name> [<name>...]",
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
    { command: "crew rm python-testing", description: "Remove the skill from every agent." },
    {
      command: "crew rm --agent codex python-testing",
      description: "Remove it from Codex only.",
    },
  ],
  seeAlso: ["uninstall", "remove", "list"],
};
