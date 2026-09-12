/**
 * Homepage command reference data (§16.6): the "Managing skills" group.
 */
import styles from "../Commands.module.css";
import type { CommandGroup } from "../Commands.types";

export const MANAGING: CommandGroup = {
  id: "cmd-managing",
  label: "Managing skills",
  commands: [
    {
      name: "install",
      signature: <>crew install &lt;ref&gt;… | crew install --from-git &lt;source&gt;</>,
      description: [
        "Install one or more skills into every detected agent; on misses, may suggest trusted taps you haven't added yet. ",
        <code key="crew-install-from-git">--from-git</code>,
        " reads its value as a git source, so a bare owner/repo means GitHub rather than tap/skill.",
      ],
    },
    {
      name: "uninstall",
      signature: <>crew uninstall [--scope {"{user,project}"}] &lt;name&gt;…</>,
      description:
        "Remove installed skills from every agent. Bare and tap-qualified names work. One scope at a time: your system-wide install by default, or this project's with --scope project.",
    },
    {
      name: "remove",
      signature: <>crew remove &lt;name&gt;… / crew rm &lt;name&gt;…</>,
      description: ["Aliases for ", <code key="crew-uninstall">crew uninstall</code>, "."],
    },
    {
      name: "update",
      signature: <>crew update [&lt;name&gt;…]</>,
      description: (
        <>
          Update all installed skills, or only those named. Names can be bare or tap-qualified.
          Pinned SHAs are skipped unless <span className={styles.flag}>--force</span>.
        </>
      ),
    },
    {
      name: "upgrade",
      signature: <>crew upgrade [&lt;name&gt;…]</>,
      description: ["Alias for ", <code key="crew-update">crew update</code>, "."],
    },
    {
      name: "list",
      signature: <>crew list [--scope {"{user,project}"}]</>,
      description: [
        "List installed skills, grouped by scope, with sources and resolved SHAs. ",
        <code key="crew-list-scope">--scope</code>,
        " narrows the listing to just your user-scoped or just your project-scoped installs.",
      ],
    },
    {
      name: "skills",
      signature: <>crew skills / crew ls</>,
      description: ["Aliases for ", <code key="crew-list">crew list</code>, "."],
    },
    {
      name: "info",
      signature: <>crew info &lt;ref-or-name&gt;</>,
      description: "Show installed details or preview a tap skill. Tap-qualified names work.",
    },
  ],
};
