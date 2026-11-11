/**
 * Which kept entries stop being manifest-owned (§9.2).
 */

import type { StateEntry, StateFile } from "../../../../core/types.ts";
import { entryKey } from "../../../../state/identity.ts";

/**
 * Clear the ownership flag on the dropped entries that are staying for
 * good: the ones sharing a physical target, and the needed ones that a
 * skill the manifest does not own requires, directly or through another
 * released skill.
 *
 * An entry whose own removal aborted stays owned, and so does one held
 * back only by such a dependent: the flag then marks cleanup still owed,
 * and the next bare install tries again.
 */
export function release(
  state: StateFile,
  removable: readonly StateEntry[],
  shared: readonly StateEntry[],
  needed: ReadonlySet<string>,
  aborted: ReadonlySet<string>,
): StateFile {
  // Names the manifest still owns at this location: the dropped entries,
  // less each one released below. A requirer outside it is a true stayer.
  const owned = new Set(removable.map((entry) => entry.name));
  const released = new Set(shared.map(entryKey));
  const kept = removable.filter((entry) => needed.has(entry.name) && !aborted.has(entry.name));
  let grew: boolean;
  do {
    grew = false;
    for (const entry of kept) {
      if (released.has(entryKey(entry))) continue;
      if (entry.required_by.every((name) => owned.has(name))) continue;
      released.add(entryKey(entry));
      owned.delete(entry.name);
      grew = true;
    }
  } while (grew);
  if (released.size === 0) return state;
  return {
    schema_version: 1,
    installations: state.installations.map((entry) => {
      if (!released.has(entryKey(entry))) return entry;
      const { manifest_owned: _released, ...rest } = entry;
      return rest;
    }),
  };
}
