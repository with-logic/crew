import type { CommandHelp } from "./types.ts";

export const helpHelp: CommandHelp = {
  name: "help",
  synopsis: "crew help [<command>]",
  summary: [
    "Show how to use Homecrew, or get details on a specific command.",
    "Running `crew` with no arguments gives you the same overview. `--help` or `-h` on any command works too: `crew install --help` is the same as `crew help install`.",
  ],
  examples: [
    { command: "crew help", description: "Overview and the full command list." },
    { command: "crew help install", description: "Everything about `crew install`." },
    { command: "crew install --help", description: "Same thing, the way most CLIs spell it." },
    { command: "crew help --json", description: "Machine-readable help for scripting." },
  ],
};
