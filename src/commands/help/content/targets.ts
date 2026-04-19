import type { CommandHelp } from "./types.ts";

export const targetsHelp: CommandHelp = {
  name: "targets",
  synopsis: "crew targets [enable|disable <name>]",
  summary: [
    "List every agent coder crew knows about and whether it's currently detected, force-enabled, or disabled.",
    "`enable` forces a target active even if auto-detection fails; `disable` skips a target on future install/update.",
  ],
  flags: [{ flag: "--json", description: "Emit structured target info." }],
  examples: [
    { command: "crew targets", description: "Show detection status for each adapter." },
    {
      command: "crew targets disable codex",
      description: "Skip Codex CLI on future install/update.",
    },
    {
      command: "crew targets enable claude-code",
      description: "Force Claude Code on even if auto-detection missed it.",
    },
  ],
  notes: [
    "v1 ships with three adapters: `claude-code`, `codex`, `gemini-cli`. Detection checks for each tool's user-scope skills directory or its CLI on PATH.",
  ],
  seeAlso: ["install", "doctor"],
};
