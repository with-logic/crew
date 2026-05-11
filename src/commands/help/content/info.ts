import type { CommandHelp } from "./types.ts";

export const infoHelp: CommandHelp = {
  name: "info",
  synopsis: "crew info <name-or-reference>",
  summary: [
    "Get the details on a skill — installed or not.",
    "If you already have it installed, you'll see what's going on locally: where it came from, which version you're on, and which agents it's in. If it's just a reference (a URL, a name in a collection you've added), Homecrew fetches the skill's metadata so you can look before you leap.",
    "Works with every reference shape `crew install` understands — see `crew help install` for the list.",
    "For non-standard nested repositories, add the source as a recursive tap first (`crew tap add --recursive ...`) and then run `crew info` against that tap.",
  ],
  flags: [{ flag: "--json", description: "Machine-readable output." }],
  examples: [
    { command: "crew info python-testing", description: "See the details on a skill you have." },
    {
      command: "crew info gh:acme/skills//python/testing",
      description: "Preview a skill without installing it.",
    },
    {
      command: "crew info @with-logic/skills",
      description: "Peek at everything a collection (by URL) has to offer.",
    },
    {
      command: "crew info team-skills",
      description: "Peek at everything a collection you've added has to offer.",
    },
  ],
  seeAlso: ["list", "search", "install"],
};
