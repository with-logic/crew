import type { CommandHelp } from "./types.ts";

export const selfUpdateHelp: CommandHelp = {
  name: "self-update",
  synopsis: "crew self-update [--check] [--version <tag>] [--force]",
  summary: [
    "Upgrade the `crew` binary itself to the latest release.",
    "Different from `crew update` — that one catches your installed skills up. This one catches the `crew` executable itself up.",
    "Safe to re-run: already on the latest? It says so and exits 0.",
  ],
  flags: [
    {
      flag: "--check",
      description:
        "Ask GitHub what the latest release is and print it. Makes no changes beyond refreshing the cached version-check record.",
    },
    {
      flag: "--version <tag>",
      description: "Install a specific tag (e.g. `v0.4.0`) instead of the latest.",
    },
    {
      flag: "--force",
      description: "Reinstall even when the resolved version matches what's already running.",
    },
  ],
  examples: [
    { command: "crew self-update", description: "Upgrade to the latest release." },
    {
      command: "crew self-update --check",
      description: "See whether a newer release exists. Doesn't download anything.",
    },
    {
      command: "crew self-update --version v0.3.0",
      description: "Install that specific release (useful for pinning or downgrading).",
    },
  ],
  notes: [
    "Homecrew checks for new releases at most once every 24 hours. When one is out, you'll see a one-line notice on stderr. Set `CREW_NO_UPDATE_CHECK=1` (or `CI=1`) to silence it.",
    "The running process keeps executing on the old binary; the new one takes effect on the next `crew` invocation.",
  ],
  seeAlso: ["update", "autoupdate", "version"],
};
