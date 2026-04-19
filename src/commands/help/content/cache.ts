import type { CommandHelp } from "./types.ts";

export const cacheHelp: CommandHelp = {
  name: "cache",
  synopsis: "crew cache clean",
  summary: [
    "Delete the ephemeral git clone cache (`~/.crew/cache/`) and any store entries no longer referenced by state.",
    "Safe to run — crew re-fetches what it needs on the next install/update. Doesn't touch installed skills or tap clones.",
  ],
  examples: [{ command: "crew cache clean", description: "Reclaim disk space." }],
  seeAlso: ["doctor", "update"],
};
