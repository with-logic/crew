import type { CommandHelp } from "./types.ts";

export const uninstallHelp: CommandHelp = {
  name: "uninstall",
  synopsis: "crew uninstall <name> [<name>...]",
  summary: [
    "Remove an installed skill from every agent on your machine.",
    "You can name the installed skill directly (`pdf`) or use a tap-qualified name like `anthropic/pdf`.",
    "Homecrew only touches skills it installed — anything else in your agents' skills folders is left alone.",
    "If the skill pulled in dependencies, those stick around by default in case you want them. Pass `--prune` to also clean up anything that's now unused, like `apt autoremove`.",
  ],
  flags: [
    {
      flag: "--scope {user,project}",
      description: "Remove the system-wide copy (default) or just the project-scoped one.",
    },
    {
      flag: "--agent <name>",
      description: "Only remove from the named agent(s); other agents keep their copy. Repeatable.",
    },
    {
      flag: "--prune",
      description:
        "Also clean up dependencies that are no longer needed. Like `apt autoremove` — safe and tidy.",
    },
    {
      flag: "--force",
      description:
        "Don't complain if the skill isn't installed, or if Homecrew's record of it got tampered with.",
    },
  ],
  examples: [
    {
      command: "crew uninstall python-testing",
      description: "Remove the skill from every agent it's in.",
    },
    {
      command: "crew uninstall core/python-testing",
      description: "Remove the installed skill using its tap-qualified name.",
    },
    {
      command: "crew uninstall --agent codex python-testing",
      description: "Remove it from Codex only; keep it in Claude Code and Gemini.",
    },
    {
      command: "crew uninstall --prune python-testing",
      description: "Remove it and anything it pulled in that's no longer needed.",
    },
    {
      command: "crew uninstall --scope project python-testing",
      description: "Only remove the project-scoped copy; leave the system-wide one.",
    },
  ],
  notes: [
    "`--prune` only touches dependencies Homecrew auto-installed for you. Anything you installed yourself stays put.",
    "If you only uninstall from some agents (`--agent`), the skill is still installed elsewhere, so its dependencies still count as needed — pruning won't touch them.",
    "Homecrew never reaches outside its own install folders. `--force` lets you get past a tampered marker, but it won't let you delete anything you didn't install through Homecrew.",
  ],
  seeAlso: ["list", "install", "agents"],
};
