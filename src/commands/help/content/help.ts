import type { CommandHelp } from "./types.ts";

export const helpHelp: CommandHelp = {
  name: "help",
  synopsis: "crew help [<command>]",
  summary: [
    "Show how to use Homecrew, or get details on a specific command.",
    "Running `crew` with no arguments gives you the same overview.",
  ],
  examples: [
    { command: "crew help", description: "Overview and the full command list." },
    { command: "crew help install", description: "Everything about `crew install`." },
    { command: "crew help --json", description: "Machine-readable help for scripting." },
  ],
};
