/**
 * State mutations for `crew uninstall` (§7.4).
 *
 * - `reduceEntryAgents` — partial removal: entry stays but loses some agents.
 * - `dropInstallLocation` — full removal of ONE install location
 *    (name, scope, project root); also scrubs the removed name from the
 *    `required_by` of surviving entries at that same location.
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

/**
 * Drop ONE install location — the `(name, scope, project_root)` entry
 * `target` names — and scrub its name from the `required_by` of
 * surviving entries at that SAME location only. A `foo -> bar` edge in
 * project A must survive uninstalling `foo` in project B, where A's
 * `foo` is still installed; scrubbing globally would orphan A's `bar`
 * and let a later `--prune` delete a dependency A still requires.
 */
export function dropInstallLocation(state: StateFile, target: StateEntry): StateFile {
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
