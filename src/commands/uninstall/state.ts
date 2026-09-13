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

/** Location-qualified key for one entry, per §11.1's (skill, scope, root) triple. */
export function entryKey(e: StateEntry): string {
  return JSON.stringify([e.name, e.scope, e.project_root ?? ""]);
}

/**
 * Drop many entries in ONE traversal, scrubbing each removed name from
 * the `required_by` of survivors at the same location.
 *
 * `dropScopedEntryAndUpdateRequiredBy` walks every installation per
 * call, so removing K skills from a tap costs K full passes over N
 * entries. Callers that already know the whole removal set — the
 * `tap remove --uninstall` path — use this instead.
 */
export function dropEntriesAndUpdateRequiredBy(
  state: StateFile,
  targets: readonly StateEntry[],
): StateFile {
  if (targets.length === 0) return state;
  const dropped = new Set<string>();
  for (const t of targets) dropped.add(entryKey(t));
  const installations: StateEntry[] = [];
  for (const e of state.installations) {
    if (dropped.has(entryKey(e))) continue;
    // Only names removed at THIS entry's location may be scrubbed from
    // its edges; a same-named skill elsewhere keeps its own.
    const names = new Set<string>();
    for (const t of targets) {
      if (sameLocation(e, t)) names.add(t.name);
    }
    const kept = e.required_by.filter((n) => !names.has(n));
    installations.push(kept.length === e.required_by.length ? e : { ...e, required_by: kept });
  }
  return { schema_version: 1, installations };
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
