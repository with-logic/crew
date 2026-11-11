/**
 * Which dropped entries stay (§9.2): the ones something surviving still
 * needs, and which of the kept ones stop being manifest-owned.
 */

import type { StateEntry, StateFile } from "../../../core/types.ts";
import { entryKey } from "../../../state/identity.ts";

/** The pending names that something staying requires, directly or through another needed one. */
export function neededNames(
  pending: ReadonlySet<string>,
  here: ReadonlyMap<string, StateEntry>,
): ReadonlySet<string> {
  const needed = new Set<string>();
  let grew: boolean;
  do {
    grew = false;
    for (const name of pending) {
      if (needed.has(name)) continue;
      const requiredByStayer = here
        .get(name)!
        .required_by.some((dependent) => !pending.has(dependent) || needed.has(dependent));
      if (!requiredByStayer) continue;
      needed.add(name);
      grew = true;
    }
  } while (grew);
  return needed;
}

/**
 * Clear the ownership flag on the dropped entries that are staying for
 * good: the ones sharing a physical target, and any left over because a
 * skill the manifest does not own requires them, directly or through
 * another released skill. An entry held back only by a dependent whose own
 * removal aborted stays owned, so it goes when that dependent finally does.
 */
export function release(
  state: StateFile,
  dropped: readonly StateEntry[],
  shared: readonly StateEntry[],
  leftover: readonly StateEntry[],
): StateFile {
  const owned = new Set(dropped.map((entry) => entry.name));
  const released = new Set(shared.map(entryKey));
  for (const entry of shared) owned.delete(entry.name);
  let grew: boolean;
  do {
    grew = false;
    for (const entry of leftover) {
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
