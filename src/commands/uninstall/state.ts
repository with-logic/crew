/**
 * State mutations for `crew uninstall` (§7.4).
 *
 * - `reduceEntryAgents` — partial removal: entry stays but loses some agents.
 * - `dropScopedEntryAndUpdateRequiredBy` — full removal at one (name, scope);
 *    also scrubs the removed name from every surviving `required_by`.
 * - `findOrphan` — identifies a skill that `--prune` should autoremove.
 */

import type { StateEntry, StateFile } from "../../core/types.ts";

/** Replace the (name, scope) entry's `agents` array with `remaining`. */
export function reduceEntryAgents(
  state: StateFile,
  name: string,
  scope: StateEntry["scope"],
  remaining: readonly string[],
): StateFile {
  return {
    schema_version: 1,
    installations: state.installations.map((e) =>
      e.name === name && e.scope === scope ? { ...e, agents: [...remaining] } : e,
    ),
  };
}

/** Drop the (name, scope) entry and scrub `name` from every surviving `required_by`. */
export function dropScopedEntryAndUpdateRequiredBy(
  state: StateFile,
  name: string,
  scope: StateEntry["scope"],
): StateFile {
  return {
    schema_version: 1,
    installations: state.installations
      .filter((e) => !(e.name === name && e.scope === scope))
      .map((e) => ({ ...e, required_by: e.required_by.filter((n) => n !== name) })),
  };
}

/** An autoremovable orphan: `explicit: false` AND empty `required_by`. */
export function findOrphan(state: StateFile): StateEntry | undefined {
  return state.installations.find((e) => !e.explicit && e.required_by.length === 0);
}
