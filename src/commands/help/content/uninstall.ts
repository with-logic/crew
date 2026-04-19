import type { CommandHelp } from "./types.ts";

export const uninstallHelp: CommandHelp = {
  name: "uninstall",
  synopsis: "crew uninstall <name> [<name>...]",
  summary: [
    "Remove installed skills from every agent coder crew put them in.",
    "Sibling skills and anything crew didn't install are left untouched. Transitively-installed dependencies are kept unless you pass `--prune`.",
    "`--target <name>` restricts removal to the named targets — other targets keep their installs, and the state entry survives with a reduced target list.",
  ],
  flags: [
    {
      flag: "--scope {user,project}",
      description: "Which scope to remove from (default user).",
    },
    {
      flag: "--target <name>",
      description:
        "Remove only from the named target(s). Repeatable. Other targets keep their copy. If this empties the state entry's targets, the entry is removed as with a full uninstall.",
    },
    {
      flag: "--prune",
      description:
        "After removing the named skills, also remove any dependency that's no longer required by anything and wasn't installed directly. Like `apt autoremove`.",
    },
    {
      flag: "--force",
      description:
        "Treat a not-installed skill as a no-op. Also allows removing a destination whose marker was tampered with.",
    },
  ],
  examples: [
    {
      command: "crew uninstall python-testing",
      description: "Remove a skill from every target it was installed in.",
    },
    {
      command: "crew uninstall --target codex python-testing",
      description: "Remove from Codex only; keep it in Claude Code and Gemini CLI.",
    },
    {
      command: "crew uninstall --prune python-testing",
      description: "Remove it and any dependency orphans it leaves behind.",
    },
    {
      command: "crew uninstall --scope project python-testing",
      description: "Only remove the project-scope copy.",
    },
  ],
  notes: [
    "`--prune` never removes a skill you installed directly (`explicit: true` in state.json) — only transitive deps. It also doesn't cascade through a partial `--target` removal: if the skill is still installed somewhere after the run, its deps are still required.",
    "`--force` doesn't let you remove things outside `{agent-base}/<skill-name>/` — those aren't crew's to touch.",
    "`--target <name>` naming a target the skill isn't installed in is a silent no-op; it doesn't trigger `not_installed_here`.",
  ],
  seeAlso: ["list", "install", "targets"],
};
