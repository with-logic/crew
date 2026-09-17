/**
 * Homepage command reference data (§16.6): the "Agents & automation" group.
 */
import styles from "../Commands.module.css";
import type { CommandGroup } from "../Commands.types";

export const AGENTS: CommandGroup = {
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
      description: "Install a platform scheduler that runs `crew update --quiet` every 4 hours.",
    },
    {
      name: "autoupdate-disable",
      signature: <>crew autoupdate disable</>,
      description: "Unload and remove the background updater.",
    },
    {
      name: "autoupdate-status",
      signature: <>crew autoupdate status</>,
      description: "Whether active, last run, next run, configured interval.",
    },
  ],
};
