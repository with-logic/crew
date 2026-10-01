/**
 * Canonical identity for one installed state entry (§11.1).
 *
 * State is keyed by the `(name, scope, project_root)` triple: two
 * project-scope entries for the same skill under different roots are
 * independent installs, not duplicates. Several call sites need that
 * triple as a comparable string — the prune sweep's attempted-set, the
 * update selector's dedup — so it lives here once rather than being
 * re-encoded per caller.
 *
 * The key is JSON-encoded rather than delimiter-joined on purpose. A
 * `project_root` is an arbitrary filesystem path and can contain any
 * delimiter we might pick, so `a::b` + `c` and `a` + `b::c` would alias
 * to one key. For a value that decides what gets removed, that is worth
 * ruling out by construction.
 */

import type { StateEntry } from "../core/types.ts";

/** The `(name, scope, project_root)` triple as a comparable string. */
export function entryKey(entry: StateEntry): string {
  return JSON.stringify([entry.name, entry.scope, entry.project_root ?? ""]);
}

/** True when both entries occupy the same install location (§11.1). */
export function sameLocation(a: StateEntry, b: StateEntry): boolean {
  return a.scope === b.scope && (a.project_root ?? null) === (b.project_root ?? null);
}
