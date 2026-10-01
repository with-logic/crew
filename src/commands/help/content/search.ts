import type { CommandHelp } from "./types.ts";

export const searchHelp: CommandHelp = {
  name: "search",
  synopsis: "crew search [--tap <name>] [<query>]",
  summary: [
    "Find a skill. Searches names and descriptions across every tap you've added.",
    "Matches are case-insensitive and partial — search for `python` to find everything Python-related. Pass `--tap <name>` to look inside just one of your taps.",
    "With a query and without `--tap`, Homecrew can also suggest matching trusted taps you haven't added yet. `--tap` asks about a tap you already have, so it skips those suggestions.",
    "Without a query, lists every skill in every tap you've added — or just the one you named with `--tap`. Exact installed matches are marked `✓`; same-name skills installed from another source are marked `!`.",
  ],
  flags: [
    {
      flag: "--tap <name>",
      description:
        "Only search the named tap (see `crew tap list`). Skips suggestions for taps you haven't added.",
    },
    { flag: "--json", description: "Machine-readable output." },
  ],
  examples: [
    { command: "crew search", description: "List every installable skill." },
    { command: "crew search python", description: "Find everything Python-related." },
    {
      command: "crew search --tap acme python",
      description: "Same search, but only inside the `acme` tap.",
    },
    { command: "crew search --tap core", description: "List everything in the `core` tap." },
    { command: "crew search 'code review'", description: "Quote multi-word queries." },
  ],
  notes: [
    "Search never fetches during the run. Known-tap suggestions are local hints; add a tap before installing from it.",
    "To look at a one-off git URL or local folder, use `crew info` instead.",
  ],
  seeAlso: ["tap", "info", "install"],
};
