import type { CommandHelp } from "./types.ts";

export const doctorHelp: CommandHelp = {
  name: "doctor",
  synopsis: "crew doctor [--verify] [--repair]",
  summary: [
    "Audit crew's state for drift between `state.json`, the markers at each install site, and the expected store entries.",
    "Safe to run any time. `--repair` reconciles recoverable drift — it never touches user-customized skills or anything outside `~/.crew/` and each skill's install directory.",
  ],
  flags: [
    { flag: "--verify", description: "Recompute every install's content hash (slower)." },
    {
      flag: "--repair",
      description:
        "Fix recoverable drift: rebuild state from markers, delete orphan store entries, reconcile autoupdate state.",
    },
    { flag: "--json", description: "Emit a structured list of findings." },
  ],
  examples: [
    { command: "crew doctor", description: "Quick integrity check." },
    {
      command: "crew doctor --verify",
      description: "Thorough check that flags user customizations (slower, hashes every file).",
    },
    {
      command: "crew doctor --repair",
      description: "Reconcile drift. Inspect findings without --repair first if unsure.",
    },
  ],
  notes: [
    "`state.json` is a convenience index; markers (`.crew.json` inside each install dir) are ground truth. `--repair` rebuilds state from markers when they disagree.",
  ],
  seeAlso: ["cache", "list"],
};
