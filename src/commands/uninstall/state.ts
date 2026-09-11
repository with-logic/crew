/**
 * State mutations for `crew uninstall` (§7.4).
 *
 * - `reduceEntryAgents` — partial removal: entry stays but loses some agents.
 * - `dropScopedEntryAndUpdateRequiredBy` — full removal of one entry
 *    (name, scope, project root); also scrubs the removed name from
 *    every surviving `required_by` at the same location.
 * - `findOrphan` — identifies a skill that `--prune` should autoremove.
 */

import type { StateEntry, StateFile } from "../../core/types.ts";

/** True when `e` is the same installed entry as `target` (name, scope, project root). */
function sameEntry(e: StateEntry, target: StateEntry): boolean {
  return e.name === target.name && sameLocation(e, target);
}

/**
 * True when both entries live at the same install location — same scope
 * and, for project scope, the same `project_root`. §11.1 keys an entry by
 * (skill, scope, project_root), so a removal at one location must never
 * mutate another's row or its dependency edges.
 */
function sameLocation(e: StateEntry, target: StateEntry): boolean {
  return e.scope === target.scope && (e.project_root ?? null) === (target.project_root ?? null);
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

/**
 * Drop `target` and scrub its name from the `required_by` of surviving
 * entries at the SAME location only. A `foo -> bar` edge in project A
 * must survive uninstalling `foo` in project B, where A's `foo` is still
 * installed; scrubbing globally would orphan A's `bar` and let a later
 * `--prune` delete a dependency A still requires.
 */
export function dropScopedEntryAndUpdateRequiredBy(
  state: StateFile,
  target: StateEntry,
): StateFile {
  const installations: StateEntry[] = [];
  for (const e of state.installations) {
    if (sameEntry(e, target)) continue;
    if (sameLocation(e, target)) {
      installations.push({ ...e, required_by: e.required_by.filter((n) => n !== target.name) });
    } else {
      installations.push(e);
    }
  }
  return { schema_version: 1, installations };
}

/** An autoremovable orphan: `explicit: false` AND empty `required_by`. */
export function findOrphan(state: StateFile): StateEntry | undefined {
  return state.installations.find((e) => !e.explicit && e.required_by.length === 0);
}
