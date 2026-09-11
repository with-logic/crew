/**
 * Help entry for the `upgrade` alias. Implements PRD §5.1.
 *
 * Flags are derived from `update`'s page — see `./alias.ts`.
 */

import { aliasHelp } from "./alias.ts";
import type { CommandHelp } from "./types.ts";
import { updateHelp } from "./update.ts";

export const upgradeHelp: CommandHelp = aliasHelp(
  {
    name: "upgrade",
    synopsis: "crew upgrade [<name>...]",
    summary: [
      "Alias for `crew update`.",
      "Catch your installed skills up to the latest versions. Takes every flag `crew update` takes.",
    ],
    examples: [
      { command: "crew upgrade", description: "Pull in every available improvement." },
      { command: "crew upgrade python-testing", description: "Just update this one skill." },
    ],
    seeAlso: ["update", "autoupdate", "list"],
  },
  updateHelp,
);
