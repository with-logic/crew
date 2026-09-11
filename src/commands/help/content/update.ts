import type { CommandHelp } from "./types.ts";

export const updateHelp: CommandHelp = {
  name: "update",
  synopsis: "crew update [<name>...]",
  summary: [
    "Catch your installed skills up to the latest versions.",
    "Run this whenever you want to pull in improvements the authors have published since you installed. With no arguments, every skill you have is checked; pass one or more names (`pdf` or `anthropic/pdf`) to update just those.",
    "If you installed a whole collection of skills at once (e.g. `crew install @your-org/skills`), any new ones the team has added show up automatically. Skills you pinned to a specific version (`skill@v1.0.0`) are left alone unless you pass `--force`.",
    "If a skill has dependencies, updating it also updates the things it depends on — your setup stays consistent.",
  ],
  flags: [
    {
      flag: "--dry-run",
      description:
        "Preview what would change — pending updates and new tap skills. Collections are still refreshed so the preview is current, but nothing you have installed is touched.",
    },
    {
      flag: "--force",
      description: "Update even pinned skills and overwrite any local edits you've made.",
    },
    { flag: "--json", description: "Machine-readable output, one record per skill." },
  ],
  examples: [
    { command: "crew update", description: "The usual: pull in every available improvement." },
    {
      command: "crew update --dry-run",
      description:
        "See what's outdated (and what new skills your taps have added) without changing any skill you have installed.",
    },
    {
      command: "crew update python-testing",
      description: "Just update this one skill (and anything it depends on).",
    },
    {
      command: "crew update core/python-testing",
      description: "Update a skill using its tap-qualified name.",
    },
    {
      command: "crew update --force my-pinned-skill",
      description: "Move a pinned skill forward anyway, or overwrite local edits.",
    },
  ],
  notes: [
    "Your edits are safe. If you've modified a skill's files locally, `crew update` leaves them alone — it won't clobber your changes unless you pass `--force`.",
    "Removed skills stay installed. If an author deletes a skill upstream, your local copy is preserved. Run `crew uninstall <name>` yourself when you want it gone.",
    "One broken skill won't stop the rest. If a source is temporarily unreachable, Homecrew updates what it can and reports the rest so you can retry later.",
    "Just want to look? `crew outdated` (or `crew update --dry-run`) shows what would change. It refreshes your collections, but leaves every installed skill alone.",
    "Want to schedule updates? See `crew autoupdate`.",
  ],
  seeAlso: ["outdated", "autoupdate", "install", "list"],
};
