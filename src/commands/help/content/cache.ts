import type { CommandHelp } from "./types.ts";

export const cacheHelp: CommandHelp = {
  name: "cache",
  synopsis: "crew cache clean",
  summary: [
    "Free up some disk space.",
    "crew keeps a few caches to make installs and updates fast. This command clears the ones that are safe to throw away — crew will just re-download what it needs next time. Your installed skills and your collections are untouched.",
  ],
  examples: [{ command: "crew cache clean", description: "Reclaim disk space. Totally safe." }],
  seeAlso: ["doctor", "update"],
};
