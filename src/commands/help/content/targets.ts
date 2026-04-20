import type { CommandHelp } from "./types.ts";

export const targetsHelp: CommandHelp = {
  name: "targets",
  synopsis: "crew targets [enable|disable <name>]",
  summary: [
    "See which agent coders crew has found on your machine, and tell it to include or skip any of them.",
    "crew auto-detects Claude Code, Codex, and Gemini. If one is missing and you want crew to install into it anyway, `enable` it. If you want crew to stay out of one, `disable` it.",
  ],
  flags: [{ flag: "--json", description: "Machine-readable output." }],
  examples: [
    { command: "crew targets", description: "See what crew found — and didn't find." },
    {
      command: "crew targets disable codex",
      description: "Tell crew to skip Codex from now on.",
    },
    {
      command: "crew targets enable claude-code",
      description: "Force Claude Code on, even if auto-detection missed it.",
    },
  ],
  notes: [
    "Known agents: `claude-code`, `codex`, `gemini-cli`. crew looks for each tool's skills folder or for its command on your PATH.",
  ],
  seeAlso: ["install", "doctor"],
};
