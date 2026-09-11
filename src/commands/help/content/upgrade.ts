/**
 * Help entry for the `upgrade` alias. Implements PRD §5.1.
 */

import type { CommandHelp } from "./types.ts";

export const upgradeHelp: CommandHelp = {
  name: "upgrade",
  synopsis: "crew upgrade [<name>...]",
  summary: [
    "Alias for `crew update`.",
    "Catch your installed skills up to the latest versions. Takes every flag `crew update` takes.",
  ],
  flags: [
    {
      flag: "--force",
      description: "Update even pinned skills and overwrite any local edits you've made.",
    },
    { flag: "--json", description: "Machine-readable output, one record per skill." },
  ],
  examples: [
    { command: "crew upgrade", description: "Pull in every available improvement." },
    { command: "crew upgrade python-testing", description: "Just update this one skill." },
  ],
  seeAlso: ["update", "autoupdate", "list"],
};
