import type { CommandHelp } from "./types.ts";

export const autoupdateHelp: CommandHelp = {
  name: "autoupdate",
  synopsis: "crew autoupdate {enable|disable|status}",
  summary: [
    "Manage a background launchd agent that runs `crew update --quiet` on a schedule.",
    "Once enabled, any bundle you've installed (e.g. `@your-org/skills`) automatically picks up new sibling skills as the team adds them upstream.",
    "The agent shows up in System Settings → General → Login Items as `Crew Skill Autoupdate`.",
  ],
  flags: [
    {
      flag: "--interval <dur>",
      description: "Interval for `enable`. Units: `s`, `m`, `h`, `d`. Default `4h`.",
    },
    { flag: "--json", description: "Structured status output." },
  ],
  examples: [
    {
      command: "crew autoupdate enable",
      description: "Turn on the default 4-hour schedule.",
    },
    {
      command: "crew autoupdate enable --interval 30m",
      description: "Run every 30 minutes.",
    },
    {
      command: "crew autoupdate status",
      description: "Check whether the agent is loaded and when it last ran.",
    },
    { command: "crew autoupdate disable", description: "Stop the background updates." },
  ],
  notes: [
    "Logs go to `~/.crew/logs/autoupdate.log`.",
    "If status says `agent_loaded: false` but config says enabled, run `crew autoupdate disable` then `enable` to reconcile — or `crew doctor --repair`.",
    "Advanced: set the `CREW_LAUNCH_AGENTS_DIR` env var to override where the plist is written (defaults to `~/Library/LaunchAgents`). Mostly a test seam; you shouldn't need it in normal use.",
  ],
  seeAlso: ["update", "doctor"],
};
