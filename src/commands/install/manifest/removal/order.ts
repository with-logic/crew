/**
 * The order dropped manifest entries are removed in, and which of them stay
 * (§9.2).
 *
 * A pure function of the dependency edges recorded in state. The caller
 * decides up front which dropped entries are staying regardless — because a
 * removal pre-check failed, say — and gets back the complete list of names
 * to remove. Deciding everything before anything is removed is what keeps a
 * dependency cycle safe: no member is taken away and then found to be
 * needed by another member that turned out to be staying.
 *
 * An entry is *needed*, and so not removed, while something that is staying
 * requires it: a skill that is not dropped, an entry in `staying`, or
 * another needed entry.
 */

import type { StateEntry } from "../../../../core/types.ts";

/**
 * The names of the entries in `dropped` to remove, dependents before what
 * they depend on. `dropped` are entries of one install location; `staying`
 * names the ones the caller has already decided to keep.
 *
 * Linear in entries and `required_by` edges.
 */
export function removalOrder(
  dropped: readonly StateEntry[],
  staying: ReadonlySet<string>,
): string[] {
  const droppedNames = new Set(dropped.map((entry) => entry.name));
  // For each dropped entry, the dropped entries it depends on.
  const dependencies = new Map<string, string[]>();
  for (const name of droppedNames) dependencies.set(name, []);
  const kept = new Set<string>();
  for (const entry of dropped) {
    let requiredByOutsider = false;
    for (const dependent of entry.required_by) {
      const edges = dependencies.get(dependent);
      if (edges) edges.push(entry.name);
      else requiredByOutsider = true;
    }
    if (requiredByOutsider || staying.has(entry.name)) kept.add(entry.name);
  }
  markDependenciesKept(kept, dependencies);

  // Count, for each removable entry, the removable entries that require it.
  // Every dependent of a removable entry is itself removable: were one
  // kept, the entry would have been marked kept above.
  const removable = dropped.map((entry) => entry.name).filter((name) => !kept.has(name));
  const waitingOn = new Map(removable.map((name) => [name, 0]));
  for (const name of removable) {
    for (const dependency of dependencies.get(name) as string[]) {
      waitingOn.set(dependency, (waitingOn.get(dependency) as number) + 1);
    }
  }
  const order: string[] = [];
  const placed = new Set<string>();
  const ready = removable.filter((name) => waitingOn.get(name) === 0);
  const place = (first: string): void => {
    const worklist = [first];
    for (let name = worklist.pop(); name !== undefined; name = worklist.pop()) {
      if (placed.has(name)) continue;
      placed.add(name);
      order.push(name);
      for (const dependency of dependencies.get(name) as string[]) {
        const left = (waitingOn.get(dependency) as number) - 1;
        waitingOn.set(dependency, left);
        if (left === 0) worklist.push(dependency);
      }
    }
  };
  for (const name of ready) place(name);
  // Whatever is left waits on something that waits on it: a dependency
  // cycle (§9 step 6) that nothing kept needs. Each pass of this loop opens
  // one such cycle at its first unplaced member.
  for (const name of removable) place(name);
  return order;
}

/** Extend `kept` with everything a kept entry depends on, transitively. */
function markDependenciesKept(
  kept: Set<string>,
  dependencies: ReadonlyMap<string, readonly string[]>,
): void {
  const worklist = [...kept];
  for (let name = worklist.pop(); name !== undefined; name = worklist.pop()) {
    for (const dependency of dependencies.get(name) as readonly string[]) {
      if (kept.has(dependency)) continue;
      kept.add(dependency);
      worklist.push(dependency);
    }
  }
}
