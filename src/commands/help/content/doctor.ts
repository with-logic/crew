import type { CommandHelp } from "./types.ts";

export const doctorHelp: CommandHelp = {
  name: "doctor",
  synopsis: "crew doctor [--verify] [--repair]",
  summary: [
    "Check that Homecrew is in good shape, and optionally fix anything that isn't.",
    "Safe to run any time — it just looks around and reports. Pass `--repair` when you want it to actually fix things it finds.",
    "Typical reasons to reach for this: something feels off, an update failed weirdly, you manually edited files Homecrew manages, or you want a quick health check.",
  ],
  flags: [
    {
      flag: "--verify",
      description:
        "Thorough check: re-hash every installed file to catch local edits. Slower, but more precise.",
    },
    {
      flag: "--repair",
      description:
        "Actually fix what's fixable: rebuild bookkeeping, tidy up leftover files, reconcile scheduled updates.",
    },
    { flag: "--json", description: "Machine-readable list of findings." },
  ],
  examples: [
    { command: "crew doctor", description: "Quick health check." },
    {
      command: "crew doctor --verify",
      description: "Thorough check that also flags any local edits you've made.",
    },
    {
      command: "crew doctor --repair",
      description: "Fix recoverable problems. Run without `--repair` first if you're not sure.",
    },
  ],
  notes: [
    "`--repair` is conservative — it won't touch skills you've edited, or anything outside Homecrew's own install folders.",
  ],
  seeAlso: ["cache", "list"],
};
