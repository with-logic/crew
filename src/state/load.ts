/**
 * Read and write `~/.crew/state.json` (§11.1).
 *
 * Rules:
 *   - A missing state file → empty state with `schema_version: 1`.
 *   - A present-but-unparseable state → treated as empty, because `doctor`
 *     is the canonical recovery path and we don't want routine commands
 *     that only read state to hard-fail on a corrupt file. (Writes always
 *     rebuild from whatever was read, so a corruption does not propagate.)
 *   - Writes go through a prettify pass (indentation, trailing newline).
 */

import type { StateEntry, StateFile } from "../core/types.ts";
import { crewHome, paths } from "../core/paths.ts";
import { tryReadJson, writeJson } from "../util/json.ts";

/** Read state.json or return an empty state file. */
export function readState(home: string = crewHome()): StateFile {
  let parsed: StateFile | null;
  try {
    parsed = tryReadJson<StateFile>(paths(home).stateFile);
  } catch {
    // Corrupt JSON — fall back to empty.
    return { schema_version: 1, installations: [] };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.installations)) {
    return { schema_version: 1, installations: [] };
  }
  return { schema_version: 1, installations: parsed.installations };
}

/** Write state.json, replacing whatever was there. */
export function writeState(state: StateFile, home: string = crewHome()): void {
  writeJson(paths(home).stateFile, state);
}

/** Upsert one entry into state. Keyed by (name, scope). */
export function upsertEntry(state: StateFile, entry: StateEntry): StateFile {
  const installations = state.installations.filter((e) => !(e.name === entry.name && e.scope === entry.scope));
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
