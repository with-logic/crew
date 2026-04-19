import type { CommandHelp } from "./types.ts";

export const searchHelp: CommandHelp = {
  name: "search",
  synopsis: "crew search <query>",
  summary: [
    "Match <query> case-insensitively against the name and description of every skill in every configured tap.",
    "Searches only taps (git-based registries). Ad-hoc git URLs and local paths don't appear in search.",
  ],
  flags: [{ flag: "--json", description: "Emit a structured array of matches." }],
  examples: [
    { command: "crew search python", description: "Find skills mentioning `python`." },
    { command: "crew search 'code review'", description: "Multi-word query (quoted)." },
  ],
  seeAlso: ["tap", "info", "install"],
};
