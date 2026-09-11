/**
 * Help entry for `crew outdated`. Implements PRD §5.1 and §10.1.1.
 */

import type { CommandHelp } from "./types.ts";

export const outdatedHelp: CommandHelp = {
  name: "outdated",
  synopsis: "crew outdated [<name>...]",
  summary: [
    "See which skills have updates available, without changing anything you have installed.",
    "This is `crew update --dry-run` with a friendlier name and a shorter answer: it fetches your taps, then lists only what would change — skills with a newer version upstream, new skills your taps have added, and anything removed upstream. If nothing would change, it says so in one line.",
    "Pass names (`pdf` or `anthropic/pdf`) to check just those skills and their dependencies.",
  ],
  flags: [
    {
      flag: "--force",
      description:
        "Also report pinned skills whose tag or SHA has moved, as `crew update --force` would.",
    },
    {
      flag: "--json",
      description: "Machine-readable output — identical to `crew update --dry-run --json`.",
    },
  ],
  examples: [
    { command: "crew outdated", description: "What would `crew update` change right now?" },
    {
      command: "crew outdated python-testing",
      description: "Check one skill (and what it depends on).",
    },
    {
      command: "crew outdated --json | jq '.rows[] | select(.outcome.kind == \"would_update\")'",
      description: "Script against the pending updates.",
    },
  ],
  notes: [
    "Nothing is installed or written — not even state. Run `crew update` when you're ready to apply.",
    "Like `crew update`, this refreshes your tap clones so the answer reflects upstream. It never touches installed skills.",
  ],
  seeAlso: ["update", "list", "autoupdate"],
};
