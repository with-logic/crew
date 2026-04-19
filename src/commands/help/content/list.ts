import type { CommandHelp } from "./types.ts";

export const listHelp: CommandHelp = {
  name: "list",
  synopsis: "crew list",
  summary: [
    "Print every skill crew currently manages, with its source, resolved SHA, which targets it's installed in, and whether it was pinned or pulled in as a dependency.",
  ],
  flags: [
    { flag: "--json", description: "Emit a structured array for scripting." },
    { flag: "--scope {user,project}", description: "Filter to one scope (default: all)." },
  ],
  examples: [
    { command: "crew list", description: "Show everything crew is tracking." },
    {
      command: "crew list --json | jq '.installations[].name'",
      description: "Pipe names into a script.",
    },
    {
      command: "crew list --json | jq '.installations[] | select(.pinned)'",
      description: "Find all pinned installs.",
    },
  ],
  seeAlso: ["info", "search", "doctor"],
};
