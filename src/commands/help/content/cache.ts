import type { CommandHelp } from "./types.ts";

export const cacheHelp: CommandHelp = {
  name: "cache",
  synopsis: "crew cache clean",
  summary: [
    "Free up some disk space.",
    "Homecrew keeps a few caches to make installs and updates fast. This command clears the ones that are safe to throw away — Homecrew will just re-download what it needs next time. Your installed skills and your collections are untouched.",
  ],
  flags: [
    {
      flag: "--dry-run",
      description: "Report how much would be freed without deleting anything.",
    },
    { flag: "--json", description: "Machine-readable output." },
  ],
  examples: [
    { command: "crew cache clean", description: "Reclaim disk space. Totally safe." },
    {
      command: "crew cache clean --dry-run",
      description: "See how much space a clean would free.",
    },
  ],
  seeAlso: ["doctor", "update"],
};
