import type { CommandHelp } from "./types.ts";

export const listHelp: CommandHelp = {
  name: "list",
  synopsis: "crew list",
  summary: [
    "Show everything you have installed.",
    "For each skill you'll see where it came from, which agents it's in, which version you're on, and whether you pinned it or it came along as a dependency.",
  ],
  flags: [
    { flag: "--json", description: "Machine-readable output, handy for scripts." },
    {
      flag: "--scope {user,project}",
      description: "Only show system-wide or project-scoped installs (default: both).",
    },
  ],
  examples: [
    { command: "crew list", description: "See what's installed." },
    {
      command: "crew list --json | jq '.installations[].name'",
      description: "Pipe names into a script.",
    },
    {
      command: "crew list --json | jq '.installations[] | select(.pinned)'",
      description: "Find every skill you've pinned to a specific version.",
    },
  ],
  seeAlso: ["info", "search", "doctor"],
};
