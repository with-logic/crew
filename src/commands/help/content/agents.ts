import type { CommandHelp } from "./types.ts";

export const agentsHelp: CommandHelp = {
  name: "agents",
  synopsis: "crew agents [enable|disable <name>]",
  summary: [
    "See which agent coders Homecrew has found on your machine, and tell it to include or skip any of them.",
    "Homecrew auto-detects every agent that supports the Agent Skills spec (Claude Code, Codex, Cursor, Gemini CLI, and many more). If one is missing and you want Homecrew to install into it anyway, `enable` it. If you want Homecrew to stay out of one, `disable` it.",
  ],
  flags: [{ flag: "--json", description: "Machine-readable output." }],
  examples: [
    { command: "crew agents", description: "See what Homecrew found — and didn't find." },
    {
      command: "crew agents disable codex",
      description: "Tell Homecrew to skip Codex from now on.",
    },
    {
      command: "crew agents enable claude-code",
      description: "Force Claude Code on, even if auto-detection missed it.",
    },
  ],
  notes: ["Homecrew looks for each tool's skills folder or for its command on your PATH."],
  seeAlso: ["install", "doctor"],
};
