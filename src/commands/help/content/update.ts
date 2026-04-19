import type { CommandHelp } from "./types.ts";

export const updateHelp: CommandHelp = {
  name: "update",
  synopsis: "crew update [<name>...]",
  summary: [
    "Re-resolve each installed skill's ref and reinstall if the upstream SHA has moved.",
    "Pinned installs (exact SHA or tag) are skipped unless `--force`. Customized installs are skipped silently — your edits are preserved.",
    "Bundles are re-expanded: new siblings upstream get installed; siblings that disappeared upstream are reported as `source_gone` and left in place locally.",
    "Fetch scope: without args, every configured tap is fetched. With `<name>...`, only the taps and ad-hoc git caches that back those skills (or the bundles they're part of) are fetched — other taps are left untouched.",
  ],
  flags: [
    {
      flag: "--force",
      description: "Update pinned skills, overwrite customized installs, and ignore user edits.",
    },
    { flag: "--json", description: "Emit a structured per-skill result table." },
  ],
  examples: [
    { command: "crew update", description: "Update every unpinned skill in state." },
    {
      command: "crew update python-testing",
      description: "Update a single skill by name; bundles containing it are also re-expanded.",
    },
    {
      command: "crew update --force python-testing",
      description: "Force-update even if the skill is pinned or has local edits.",
    },
  ],
  notes: [
    "Upstream deletion is soft: if a skill is removed upstream but its source still resolves, `crew update` reports `source_gone` and leaves your local install untouched. Run `crew uninstall <name>` when you want it gone.",
    "Network failures are isolated per-skill — one broken source doesn't stop the rest.",
    "Use `crew tap update` if you only want to refresh tap clones (for faster `crew search`) without touching installed skills.",
  ],
  seeAlso: ["autoupdate", "install", "list"],
};
