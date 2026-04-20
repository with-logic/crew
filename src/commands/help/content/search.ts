import type { CommandHelp } from "./types.ts";

export const searchHelp: CommandHelp = {
  name: "search",
  synopsis: "crew search <query>",
  summary: [
    "Find a skill. Searches names and descriptions across every collection you've added.",
    "Matches are case-insensitive and partial — search for `python` to find everything Python-related.",
  ],
  flags: [{ flag: "--json", description: "Machine-readable output." }],
  examples: [
    { command: "crew search python", description: "Find everything Python-related." },
    { command: "crew search 'code review'", description: "Quote multi-word queries." },
  ],
  notes: [
    "Search covers collections you've added (see `crew tap`). To look at a one-off git URL or local folder, use `crew info` instead.",
  ],
  seeAlso: ["tap", "info", "install"],
};
