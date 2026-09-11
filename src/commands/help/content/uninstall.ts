import type { CommandHelp } from "./types.ts";

export const uninstallHelp: CommandHelp = {
  name: "uninstall",
  synopsis: "crew uninstall <name> [<name>...] | crew uninstall --all",
  summary: [
    "Remove an installed skill from every agent on your machine.",
    "You can name the installed skill directly (`pdf`) or use a tap-qualified name like `anthropic/pdf`.",
    "You can also name a whole collection: a tap (`acme`) removes everything you installed from it, and a namespace (`acme/marketing`) removes that bundle. A skill name always wins if one is installed under that name.",
    "Homecrew only touches skills it installed — anything else in your agents' skills folders is left alone.",
    "If the skill pulled in dependencies, those stick around by default in case you want them. Pass `--prune` to also clean up anything that's now unused, like `apt autoremove`.",
  ],
  flags: [
    {
      flag: "--scope {user,project}",
      description:
        "Remove the system-wide copy (default) or just the copy installed in the current project. The other scope is never touched. If a skill is installed in exactly one project and you're somewhere else, `--scope project` still finds it; with several, run the command from the project you mean.",
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
      flag: "--all",
      description:
        "Remove every skill at the target scope. Asks first; pass `--yes` to skip the question in scripts.",
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
    {
      command: "crew uninstall acme",
      description: "Remove every skill you installed from the `acme` collection.",
    },
    {
      command: "crew uninstall acme/marketing",
      description: "Remove just the skills in one namespace of a collection.",
    },
    {
      command: "crew uninstall --all --yes",
      description: "Start over: remove everything, no questions asked.",
    },
  ],
  notes: [
    "`--prune` only touches dependencies Homecrew auto-installed for you. Anything you installed yourself stays put.",
    "If you only uninstall from some agents (`--agent`), the skill is still installed elsewhere, so its dependencies still count as needed — pruning won't touch them.",
    "Homecrew never reaches outside its own install folders. `--force` lets you get past a tampered marker, but it won't let you delete anything you didn't install through Homecrew.",
    "If the skill is installed at a different scope than the one you asked for, Homecrew tells you where it is and the exact command to remove it, instead of guessing.",
    "If a name is both a collection and a namespace in another collection, Homecrew asks you to be specific rather than guessing which one you meant.",
  ],
  seeAlso: ["list", "install", "agents"],
};
