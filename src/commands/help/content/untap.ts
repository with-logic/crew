/**
 * Help entry for the `untap` alias. Implements PRD §5.1 and §14.
 */

import type { CommandHelp } from "./types.ts";

export const untapHelp: CommandHelp = {
  name: "untap",
  synopsis: "crew untap <name>",
  summary: [
    "Alias for `crew tap remove <name>`.",
    "Stop using a tap, delete its local clone if it was git-backed, and drop it from config.",
  ],
  flags: [
    {
      flag: "--force",
      description:
        "Allow removing the default `core` tap, or drop a tap while keeping the skills you installed from it.",
    },
    {
      flag: "--uninstall",
      description: "Also uninstall every skill that came from the tap.",
    },
  ],
  examples: [
    { command: "crew untap acme", description: "Stop using the `acme` tap." },
    {
      command: "crew untap --uninstall acme",
      description: "Stop using it and remove the skills you installed from it.",
    },
  ],
  notes: [
    "If you've installed skills from the tap, Homecrew asks before removing it: `--uninstall` takes the skills with it, `--force` leaves them installed.",
  ],
  seeAlso: ["tap", "taps", "install", "search"],
};
