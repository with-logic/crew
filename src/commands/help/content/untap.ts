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
  flags: [{ flag: "--force", description: "Allow removing the default `core` tap." }],
  examples: [{ command: "crew untap acme", description: "Stop using the `acme` tap." }],
  seeAlso: ["tap", "taps", "install", "search"],
};
