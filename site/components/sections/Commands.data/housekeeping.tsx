/**
 * Homepage command reference data (§16.6): the "Housekeeping" group.
 */
import styles from "../Commands.module.css";
import type { CommandGroup } from "../Commands.types";

export const HOUSEKEEPING: CommandGroup = {
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
};
