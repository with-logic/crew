/**
 * Read and write `~/.crew/state.json` (§11.1).
 *
 * Rules:
 *   - A missing state file → empty state at the current schema.
 *   - A present-but-unparseable state → treated as empty, because `doctor`
 *     is the canonical recovery path and we don't want routine commands
 *     that only read state to hard-fail on a corrupt file. (Writes always
 *     rebuild from whatever was read, so a corruption does not propagate.)
 *   - Writes go through a prettify pass (indentation, trailing newline).
 *
 * State is keyed by `(name, scope, project_root)`. Two project-scope
 * entries for the same skill under different `project_root`s are
 * independent installs, not duplicates.
 */

import { crewHome, paths } from "../core/paths.ts";
import type { StateEntry, StateFile } from "../core/types.ts";
import { tryReadJson, writeJson } from "../util/json.ts";

/** Read state.json or return an empty state file. */
export function readState(home: string = crewHome()): StateFile {
  let parsed: { installations?: unknown } | null;
  try {
    parsed = tryReadJson(paths(home).stateFile);
  } catch {
    // Corrupt JSON — fall back to empty.
    return { schema_version: 1, installations: [] };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.installations)) {
    return { schema_version: 1, installations: [] };
  }
  const installations = (parsed.installations as StateEntry[]).filter(hasUsableLocation);
  return { schema_version: 1, installations };
}

/**
 * §11.1 requires a project-scope entry to carry the `project_root` it
 * was installed under: that path is the authoritative install location,
 * and commands paste it into user-facing remedies. `state.json` is
 * user-editable and may predate the field, so an entry missing it is
 * dropped here rather than allowed to reach a caller that would render
 * an empty path (`cd ''`) or resolve against the wrong directory.
 * `doctor --repair` rebuilds such entries from their markers.
 */
function hasUsableLocation(entry: StateEntry): boolean {
  return entry.scope !== "project" || typeof entry.project_root === "string";
}

/** Write state.json, replacing whatever was there. */
export function writeState(state: StateFile, home: string = crewHome()): void {
  writeJson(paths(home).stateFile, state);
}

/**
 * Upsert one entry into state. Keyed by (name, scope, project_root).
 * A user-scope entry's `project_root` is undefined; two such entries
 * with the same name collide (there can be only one at user scope).
 * Two project-scope entries for the same skill at different roots are
 * independent and coexist.
 */
export function upsertEntry(state: StateFile, entry: StateEntry): StateFile {
  const installations = state.installations.filter(
    (e) =>
      !(
        e.name === entry.name &&
        e.scope === entry.scope &&
        (e.project_root ?? null) === (entry.project_root ?? null)
      ),
  );
  return { schema_version: 1, installations: [...installations, entry] };
}

/** Remove every entry with the given name (across scopes). */
export function removeByName(state: StateFile, name: string): StateFile {
  return { schema_version: 1, installations: state.installations.filter((e) => e.name !== name) };
}

/** Remove a specific (name, scope) entry. */
export function removeEntry(state: StateFile, name: string, scope: StateEntry["scope"]): StateFile {
  return {
    schema_version: 1,
    installations: state.installations.filter((e) => !(e.name === name && e.scope === scope)),
  };
}
