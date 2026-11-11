/**
 * The order dropped entries are removed in, and which of them stay (§9.2).
 *
 * Built once from the dependency edges recorded in state, then advanced as
 * removals succeed or abort, so a large manifest costs one pass over its
 * entries and edges rather than a rescan per removal.
 *
 * An entry is *needed* while something that is staying requires it: a skill
 * the manifest does not own, a dropped entry whose own removal aborted, or
 * another needed entry. Needed entries are never offered for removal.
 */

import type { StateEntry } from "../../../../core/types.ts";

/** Hands out dropped entries, dependents before what they depend on. */
export interface RemovalOrder {
  /** The next entry to remove, or undefined when none is left that may go. */
  next(): string | undefined;
  /** Record that the entry `next()` returned was removed. */
  removed(name: string): void;
  /** Record that its removal aborted: it stays, so what it requires is needed. */
  aborted(name: string): void;
  /** Names never offered for removal, because something staying needs them. */
  needed(): ReadonlySet<string>;
}

/** Plan the removal of `dropped`, all entries of one install location. */
export function planRemovalOrder(dropped: readonly StateEntry[]): RemovalOrder {
  const pending = new Set(dropped.map((entry) => entry.name));
  const dependents = new Map<string, Set<string>>();
  const dependencies = new Map<string, string[]>();
  for (const name of pending) dependencies.set(name, []);
  const needed = new Set<string>();
  for (const entry of dropped) {
    const droppedDependents = entry.required_by.filter((name) => pending.has(name));
    dependents.set(entry.name, new Set(droppedDependents));
    for (const dependent of droppedDependents) dependencies.get(dependent)?.push(entry.name);
    // Required by something that is not dropped at all: a stayer from the start.
    if (droppedDependents.length < entry.required_by.length) needed.add(entry.name);
  }
  const spread = (from: Iterable<string>): void => {
    const queue = [...from];
    for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
      for (const dependency of dependencies.get(name) ?? []) {
        if (needed.has(dependency)) continue;
        needed.add(dependency);
        queue.push(dependency);
      }
    }
  };
  spread([...needed]);
  const ready = [...pending].filter((name) => dependents.get(name)?.size === 0);

  return {
    next(): string | undefined {
      for (let name = ready.pop(); name !== undefined; name = ready.pop()) {
        if (pending.has(name) && !needed.has(name)) return name;
      }
      // Everything left that may go is required by something else that may
      // go: a dependency cycle (§9 step 6). Take it apart one member at a time.
      for (const name of pending) if (!needed.has(name)) return name;
      return undefined;
    },
    removed(name: string): void {
      pending.delete(name);
      for (const dependency of dependencies.get(name) ?? []) {
        const remaining = dependents.get(dependency);
        remaining?.delete(name);
        if (remaining?.size === 0) ready.push(dependency);
      }
    },
    aborted(name: string): void {
      pending.delete(name);
      spread([name]);
    },
    needed: () => needed,
  };
}
