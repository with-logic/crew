import type { CommandHelp } from "./types.ts";

export const autoupdateHelp: CommandHelp = {
  name: "autoupdate",
  synopsis: "crew autoupdate {enable|disable|status}",
  summary: [
    "Keep your skills up to date automatically, in the background.",
    "Turn it on and crew checks for updates on a schedule — your team's new skills appear, existing ones roll forward. No more forgetting to run `crew update`.",
    "On macOS, you'll see it in System Settings → General → Login Items as `Crew Skill Autoupdate`.",
  ],
  flags: [
    {
      flag: "--interval <time>",
      description: "How often to check (e.g. `30m`, `2h`, `1d`). Default is every 4 hours.",
    },
    { flag: "--json", description: "Machine-readable output for `status`." },
  ],
  examples: [
    {
      command: "crew autoupdate enable",
      description: "Turn it on, every 4 hours.",
    },
    {
      command: "crew autoupdate enable --interval 30m",
      description: "Check every 30 minutes instead.",
    },
    {
      command: "crew autoupdate status",
      description: "See whether it's running and when it last checked.",
    },
    { command: "crew autoupdate disable", description: "Turn it off." },
  ],
  notes: [
    "Logs go to `~/.crew/logs/autoupdate.log` if you want to see what it's been doing.",
    "If status ever looks wrong (e.g. says it's enabled but not running), `crew autoupdate disable` then `enable` is a safe reset. `crew doctor --repair` can also sort it out.",
  ],
  seeAlso: ["update", "doctor"],
};
