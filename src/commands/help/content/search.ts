import type { CommandHelp } from "./types.ts";

export const searchHelp: CommandHelp = {
  name: "search",
  synopsis: "crew search [<query>]",
  summary: [
    "Find a skill. Searches names and descriptions across every collection you've added.",
    "Matches are case-insensitive and partial — search for `python` to find everything Python-related.",
    "With a query, Homecrew can also suggest matching known taps you haven't added yet.",
    "Without a query, lists every skill in every configured tap. Installed skills are marked `✓`.",
  ],
  flags: [{ flag: "--json", description: "Machine-readable output." }],
  examples: [
    { command: "crew search", description: "List every installable skill." },
    { command: "crew search python", description: "Find everything Python-related." },
    { command: "crew search 'code review'", description: "Quote multi-word queries." },
  ],
  notes: [
    "Search never fetches during the run. Known-tap suggestions are local hints; add a tap before installing from it.",
    "To look at a one-off git URL or local folder, use `crew info` instead.",
  ],
  seeAlso: ["tap", "info", "install"],
};
