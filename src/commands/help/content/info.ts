import type { CommandHelp } from "./types.ts";

export const infoHelp: CommandHelp = {
  name: "info",
  synopsis: "crew info <ref-or-name>",
  summary: [
    "Show metadata for a skill. If the argument matches an installed skill name, details come from local state; otherwise the ref is resolved and the skill is inspected fresh without installing it.",
    "Accepts the same reference shapes as `crew install` — see `crew help install` for the full list (tap names, paths, git URLs, `gh:`/`gl:`/`bb:` and `@owner/repo` shorthands).",
  ],
  flags: [{ flag: "--json", description: "Emit a structured payload." }],
  examples: [
    { command: "crew info python-testing", description: "Show details for an installed skill." },
    {
      command: "crew info gh:acme/skills//python/testing",
      description: "Inspect a skill without installing.",
    },
    {
      command: "crew info @with-logic/skills",
      description: "Preview every skill in a tap (by URL).",
    },
    {
      command: "crew info team-skills",
      description: "Preview every skill in a configured tap (by name).",
    },
  ],
  seeAlso: ["list", "search", "install"],
};
