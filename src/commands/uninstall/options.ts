/**
 * How one call to `removeOne` should remove a skill (§7.4, §14). Every
 * field is optional; the default is a full uninstall from every agent the
 * skill is on, with its state entries dropped as they are removed.
 */

export interface RemoveOptions {
  /** The removal was driven by `--prune`, not by a direct argument; the record says so. */
  readonly pruned?: boolean;
  /**
   * Remove from these agents only. The state entry survives with a reduced
   * `agents` list if any remain. Absent or null: every agent the skill is on.
   */
  readonly agentFilter?: readonly string[] | null;
  /** Leave fully removed entries in the returned state; the caller drops them together. */
  readonly deferStateEntryDrops?: boolean;
  /** Skills directories known to be unusable for this run, which are not touched. */
  readonly unavailableBases?: ReadonlySet<string> | undefined;
}
