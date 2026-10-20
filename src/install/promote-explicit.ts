/**
 * Explicit-flag promotion for the install flow (§9 step 10).
 *
 * A skill first pulled in as a dependency is recorded with `explicit:
 * false`. When the user later names it directly, the entry is promoted.
 * The flag never demotes — once someone asks for a skill by name, crew
 * keeps remembering that.
 */

import type { Scope, StateFile } from "../core/types.ts";

/**
 * Mark each named (name, scope) state entry as `explicit: true`.
 * Idempotent; any name not present at that scope is silently ignored.
 */
export function promoteExplicit(
  state: StateFile,
  names: readonly string[],
  scope: Scope,
  projectRoot: string | null,
): StateFile {
  if (names.length === 0) return state;
  const set = new Set(names);
  return {
    schema_version: 1,
    installations: state.installations.map((e) =>
      e.scope === scope && set.has(e.name) && (e.project_root ?? null) === projectRoot
        ? { ...e, explicit: true }
        : e,
    ),
  };
}
