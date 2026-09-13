/**
 * Dependency-closure expansion for `crew update` (§10.1 step 2).
 *
 * Split from `./selection.ts` (200-line cap). Given the entries the
 * user's selectors resolved to, walk `required_by` outward so updating
 * a skill also updates what it depends on, and record which top-level
 * name pulled each transitive entry in.
 */

import type { StateEntry, StateFile } from "../../core/types.ts";
import { type CollectionSubject, entryIdentity } from "../../state/collections.ts";

export interface DependencyClosure {
  readonly selectedNames: ReadonlySet<string>;
  readonly transitiveSources: ReadonlyMap<string, readonly string[]>;
}

export function dependencyClosureFor(
  state: StateFile,
  names: readonly string[],
  topLevel: ReadonlySet<string>,
): DependencyClosure {
  const selectedNames = new Set<string>();
  const ancestors = new Map<string, Set<string>>();
  const visited = new Set<string>();
  // Reverse dependency index, built once: `required_by` name -> the
  // entries that declare it. The previous form rescanned every
  // installation for each dequeue, which is quadratic on a large
  // collection update.
  const dependents = new Map<string, string[]>();
  for (const candidate of state.installations) {
    for (const parent of candidate.required_by) {
      const bucket = dependents.get(parent);
      if (bucket) bucket.push(candidate.name);
      else dependents.set(parent, [candidate.name]);
    }
  }
  // Iterated in place rather than with `shift()`, which re-indexes the
  // whole array on every step. Appending during iteration is
  // intentional: the array iterator picks up entries pushed below, and
  // the loop terminates because a node only enqueues its dependents on
  // its first visit, so each of the finitely many names is expanded once.
  const queue = names.map((name) => ({ name, rootedAt: name }));
  for (const { name, rootedAt } of queue) {
    const firstVisit = !visited.has(name);
    visited.add(name);
    selectedNames.add(name);
    if (!topLevel.has(name)) {
      if (!ancestors.has(name)) ancestors.set(name, new Set());
      ancestors.get(name)!.add(rootedAt);
    }
    if (!firstVisit) continue;
    for (const dependent of dependents.get(name) ?? []) {
      queue.push({ name: dependent, rootedAt });
    }
  }
  const transitiveSources = new Map<string, readonly string[]>();
  for (const [name, set] of ancestors) transitiveSources.set(name, [...set].sort());
  return { selectedNames, transitiveSources };
}

/** Preserve the user's requested entries first, then append dependency entries in state order. */
export function orderedEntries(
  state: StateFile,
  subjects: readonly CollectionSubject[],
  selectedNames: ReadonlySet<string>,
  topLevel: ReadonlySet<string>,
): readonly StateEntry[] {
  const entries: StateEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: StateEntry) => {
    const key = entryIdentity(entry);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  for (const subject of subjects) {
    for (const entry of subject.entries) add(entry);
  }
  for (const entry of state.installations) {
    // Dependency entries are matched by name — `required_by` records
    // names, not identities. A skill the user named directly is already
    // added above at its exact identity, so skip every entry carrying a
    // top-level name: adding the others here would pull in same-named
    // installs from other taps or scopes that were never selected
    // (§10.1).
    if (!selectedNames.has(entry.name) || topLevel.has(entry.name)) continue;
    add(entry);
  }
  return entries;
}
