/**
 * State mutations for `crew uninstall` (§7.4).
 *
 * - `reduceEntryAgents` — partial removal: entry stays but loses some agents.
 * - `dropScopedEntriesAndUpdateRequiredBy` — full removal of a batch of
 *    entries (name, scope, project root); also scrubs the removed names
 *    from every surviving same-location `required_by`.
 * - `findOrphan` — identifies a skill that `--prune` should autoremove.
 */

import type { StateEntry, StateFile } from "../../core/types.ts";
import { entryKey, sameLocation } from "../../state/identity.ts";

/** True when `e` is the same installed entry as `target` (name, scope, project root). */
function sameEntry(e: StateEntry, target: StateEntry): boolean {
  return e.name === target.name && sameLocation(e, target);
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

/** Location key for an entry: scope plus project root (§11.1). */
function locationKey(e: StateEntry): string {
  return JSON.stringify([e.scope, e.project_root ?? ""]);
}

/**
 * Drop every entry in `targets` and scrub their names from the
 * `required_by` of surviving entries at the SAME location, in a single
 * pass over state.
 *
 * Same-location only: a `foo -> bar` edge in project A must survive
 * uninstalling `foo` in project B, where A's `foo` is still installed;
 * scrubbing globally would orphan A's `bar` and let a later `--prune`
 * delete a dependency A still requires.
 *
 * Batched because removing a whole tap previously rebuilt the entire
 * installations array once per skill — quadratic in the number of
 * installed skills, all of it under the state lock.
 */
export function dropScopedEntriesAndUpdateRequiredBy(
  state: StateFile,
  targets: readonly StateEntry[],
): StateFile {
  if (targets.length === 0) return state;
  const dropped = new Set<string>();
  const namesByLocation = new Map<string, Set<string>>();
  for (const t of targets) {
    const loc = locationKey(t);
    dropped.add(entryKey(t));
    const names = namesByLocation.get(loc);
    if (names) names.add(t.name);
    else namesByLocation.set(loc, new Set([t.name]));
  }
  const installations: StateEntry[] = [];
  for (const e of state.installations) {
    const loc = locationKey(e);
    if (dropped.has(entryKey(e))) continue;
    const names = namesByLocation.get(loc);
    if (names) {
      installations.push({ ...e, required_by: e.required_by.filter((n) => !names.has(n)) });
    } else {
      installations.push(e);
    }
  }
  return { schema_version: 1, installations };
}

/**
 * An autoremovable orphan at the given scope: `explicit: false` AND
 * empty `required_by`. For project scope, only entries whose
 * `project_root` is in `roots` qualify (§7.4 step 5: same scope).
 *
 * `attempted` holds the entry keys the caller has already tried this
 * run. The prune sweep loops on this function, and a removal that
 * aborts on a safety check deliberately KEEPS its state entry — so
 * without this set the same orphan would be returned forever. Skipping
 * attempted keys makes termination a property of the loop rather than
 * of the entry disappearing.
 */
export function findOrphan(
  state: StateFile,
  scope: StateEntry["scope"],
  roots: ReadonlySet<string | null>,
  attempted: ReadonlySet<string>,
): StateEntry | undefined {
  return state.installations.find(
    (e) =>
      !e.explicit &&
      e.required_by.length === 0 &&
      e.scope === scope &&
      roots.has(e.project_root ?? null) &&
      !attempted.has(entryKey(e)),
  );
}
