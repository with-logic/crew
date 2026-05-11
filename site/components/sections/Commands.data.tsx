/**
 * Static homepage command reference data (§16.6).
 */
import styles from "./Commands.module.css";
import type { CommandGroup } from "./Commands.types";

export const GROUPS: readonly CommandGroup[] = [
  {
    id: "cmd-managing",
    label: "Managing skills",
    commands: [
      {
        name: "install",
        signature: <>crew install &lt;ref&gt;…</>,
        description:
          "Install one or more skills into every detected agent; on misses, may suggest skills from trusted known taps you haven't added yet.",
      },
      {
        name: "uninstall",
        signature: <>crew uninstall &lt;name&gt;…</>,
        description: "Remove installed skills from every agent they were installed into.",
      },
      {
        name: "update",
        signature: <>crew update [&lt;name&gt;…]</>,
        description: (
          <>
            Update all installed skills, or only those named. Pinned SHAs are skipped unless{" "}
            <span className={styles.flag}>--force</span>.
          </>
        ),
      },
      {
        name: "list",
        signature: <>crew list</>,
        description: "List installed skills, grouped by scope, with sources and resolved SHAs.",
      },
      {
        name: "skills",
        signature: <>crew skills</>,
        description: ["Alias for ", <code key="crew-list">crew list</code>, "."],
      },
      {
        name: "info",
        signature: <>crew info &lt;ref-or-name&gt;</>,
        description: "Show details for an installed skill or one available in a tap.",
      },
    ],
  },
  {
    id: "cmd-discovery",
    label: "Discovery",
    commands: [
      {
        name: "search",
        signature: <>crew search [&lt;query&gt;]</>,
        description: (
          <>
            Case-insensitive substring match across every configured tap. With no query, lists every
            installable skill — installed ones are marked <code>✓</code>. With a query, also
            suggests matching known taps to add.
          </>
        ),
      },
      {
        name: "tap-add",
        signature: <>crew tap add [--recursive] &lt;url-or-path&gt; [name]</>,
        description: (
          <>
            Clone a registry into <code>~/.crew/taps/</code>. Name defaults to the repo name.
            Recursive discovery is opt-in for trusted non-standard layouts.
          </>
        ),
      },
      {
        name: "tap-remove",
        signature: <>crew tap remove &lt;name&gt;</>,
        description: "Delete a local tap clone and drop it from config.",
      },
      {
        name: "tap-list",
        signature: <>crew tap list</>,
        description: "Print each tap's name, URL, and last-fetched timestamp.",
      },
      {
        name: "taps",
        signature: <>crew taps</>,
        description: ["Alias for ", <code key="crew-tap-list">crew tap list</code>, "."],
      },
      {
        name: "tap-update",
        signature: <>crew tap update [&lt;name&gt;…]</>,
        description: (
          <>
            Fetch + fast-forward every git tap (or the named subset). Doesn't touch installed skills
            — use <code>crew update</code> for that.
          </>
        ),
      },
    ],
  },
  {
    id: "cmd-agents",
    label: "Agents & automation",
    commands: [
      {
        name: "agents",
        signature: <>crew agents</>,
        description: "List detected agents and whether they're enabled, disabled, or forced.",
      },
      {
        name: "agents-enable",
        signature: <>crew agents enable &lt;name&gt;</>,
        description: "Force-enable an agent even if auto-detection misses it.",
      },
      {
        name: "agents-disable",
        signature: <>crew agents disable &lt;name&gt;</>,
        description: "Skip this agent on all install and update operations.",
      },
      {
        name: "autoupdate-enable",
        signature: (
          <>
            crew autoupdate enable <span className={styles.flag}>[--interval]</span>
          </>
        ),
        description: (
          <>
            Install a launchd user agent that runs <code>crew update --quiet</code> on an interval
            (default 4h).
          </>
        ),
      },
      {
        name: "autoupdate-disable",
        signature: <>crew autoupdate disable</>,
        description: "Unload and remove the background update agent.",
      },
      {
        name: "autoupdate-status",
        signature: <>crew autoupdate status</>,
        description: "Whether active, last run, next run, configured interval.",
      },
    ],
  },
  {
    id: "cmd-housekeeping",
    label: "Housekeeping",
    commands: [
      {
        name: "doctor",
        signature: (
          <>
            crew doctor <span className={styles.flag}>[--verify] [--repair]</span>
          </>
        ),
        description: (
          <>
            Check integrity between state, markers, and agent directories.{" "}
            <span className={styles.flag}>--repair</span> fixes recoverable drift without ever
            touching customized files.
          </>
        ),
      },
      {
        name: "cache-clean",
        signature: <>crew cache clean</>,
        description: "Remove ephemeral caches and unreferenced store entries.",
      },
      {
        name: "self-update",
        signature: (
          <>
            crew self-update <span className={styles.flag}>[--check]</span>
          </>
        ),
        description: (
          <>
            Upgrade the <code>crew</code> binary itself to the latest verified release.{" "}
            <span className={styles.flag}>--check</span> reports without downloading.
          </>
        ),
      },
    ],
  },
  {
    id: "cmd-meta",
    label: "Meta",
    commands: [
      {
        name: "help",
        signature: <>crew help [&lt;command&gt;]</>,
        description: "Overview or per-command help, with realistic examples.",
      },
      { name: "version", signature: <>crew version</>, description: "Print the version string." },
    ],
  },
];
