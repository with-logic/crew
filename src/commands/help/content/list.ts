import type { CommandHelp } from "./types.ts";

export const listHelp: CommandHelp = {
  name: "list",
  synopsis: "crew list",
  summary: [
    "Show everything you have installed.",
    "For each skill you'll see where it came from, which agents it's in, which version you're on, and whether you pinned it or it came along as a dependency.",
    "The source column shows a collection you added by name, or — for a one-off install from a repo — the reference it came from. It is built for reading, not for pasting: a URL carrying credentials has them masked out, so re-type the original reference rather than the label.",
  ],
  flags: [
    { flag: "--json", description: "Machine-readable output, handy for scripts." },
    {
      flag: "--scope {user,project}",
      description: "Only show user-scoped or project-scoped installs (default: both).",
    },
    {
      flag: "--agent <name>",
      description: "Only show skills installed into the named agent(s). Repeatable.",
    },
    {
      flag: "--tap <name>",
      description: "Only show skills that came from the named tap.",
    },
  ],
  examples: [
    { command: "crew list", description: "See what's installed." },
    {
      command: "crew list --scope project",
      description: "Only the project-scoped installs, one row per project.",
    },
    { command: "crew list --agent codex", description: "What's in Codex?" },
    { command: "crew list --tap core", description: "Everything you installed from `core`." },
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
