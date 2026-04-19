import type { CommandHelp } from "./types.ts";

export const helpHelp: CommandHelp = {
  name: "help",
  synopsis: "crew help [<command>]",
  summary: [
    "Show overall usage, or detailed help for a specific command.",
    "Running `crew` with no arguments is the same as `crew help`.",
  ],
  examples: [
    { command: "crew help", description: "Overview and command list." },
    { command: "crew help install", description: "Detailed help for `install`." },
    { command: "crew help --json", description: "Machine-readable help for scripting." },
  ],
};
