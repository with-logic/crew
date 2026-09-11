/**
 * State mutations for `crew uninstall` (§7.4).
 *
 * - `reduceEntryAgents` — partial removal: entry stays but loses some agents.
 * - `dropScopedEntryAndUpdateRequiredBy` — full removal of one entry
 *    (name, scope, project root); also scrubs the removed name from
 *    every surviving `required_by`.
 * - `findOrphan` — identifies a skill that `--prune` should autoremove.
 */

import type { StateEntry, StateFile } from "../../core/types.ts";

/** True when `e` is the same installed entry as `target` (name, scope, project root). */
function sameEntry(e: StateEntry, target: StateEntry): boolean {
  return (
    e.name === target.name &&
    e.scope === target.scope &&
    (e.project_root ?? null) === (target.project_root ?? null)
  );
}

/** Replace `target`'s `agents` array with `remaining`. */
export function reduceEntryAgents(
  state: StateFile,
  target: StateEntry,
  remaining: readonly string[],
): StateFile {
  return {
    schema_version: 1,
    installations: state.installations.map((e) =>
      sameEntry(e, target) ? { ...e, agents: [...remaining] } : e,
    ),
  };
}

/** Drop `target` and scrub its name from every surviving `required_by`. */
export function dropScopedEntryAndUpdateRequiredBy(
  state: StateFile,
  target: StateEntry,
): StateFile {
  return {
    schema_version: 1,
    installations: state.installations
      .filter((e) => !sameEntry(e, target))
      .map((e) => ({ ...e, required_by: e.required_by.filter((n) => n !== target.name) })),
  };
}

/**
 * An autoremovable orphan at the given scope: `explicit: false` AND
 * empty `required_by`. For project scope, only entries whose
 * `project_root` is in `roots` qualify (§7.4 step 5: same scope).
 */
export function findOrphan(
  state: StateFile,
  scope: StateEntry["scope"],
  roots: ReadonlySet<string | null>,
): StateEntry | undefined {
  return state.installations.find(
    (e) =>
      !e.explicit &&
      e.required_by.length === 0 &&
      e.scope === scope &&
      roots.has(e.project_root ?? null),
  );
}
