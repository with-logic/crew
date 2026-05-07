/**
 * Help entry for the `taps` alias. Implements PRD §5.1 and §14.
 */

import type { CommandHelp } from "./types.ts";

export const tapsHelp: CommandHelp = {
  name: "taps",
  synopsis: "crew taps",
  summary: [
    "Alias for `crew tap list`.",
    "Show every collection Homecrew searches and installs from.",
  ],
  flags: [
    {
      flag: "--json",
      description: "Machine-readable output, same as `crew tap list --json`.",
    },
  ],
  examples: [
    {
      command: "crew taps",
      description: "See every collection Homecrew is pulling from.",
    },
  ],
  seeAlso: ["tap", "search", "install"],
};
