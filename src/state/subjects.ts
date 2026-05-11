/**
 * Installed skill selector resolution for state-oriented commands (§7.4, §10.1).
 *
 * Commands such as `info`, `update`, and `uninstall` operate on entries already
 * present in `state.json`. They accept either the stored skill name (`pdf`) or a
 * more specific tap-qualified selector (`anthropic/pdf`) that identifies the
 * same installed entry.
 */

import type { StateEntry, StateFile, TapSource } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";

export interface StateSubject {
  readonly raw: string;
  readonly name: string;
  readonly entries: readonly StateEntry[];
}

/** Resolve one command argument to installed state entries, if it names any. */
export function resolveStateSubject(state: StateFile, raw: string): StateSubject {
  const direct = state.installations.filter((entry) => entry.name === raw);
  if (direct.length > 0) return { raw, name: raw, entries: direct };

  const source = parseStateTapRef(raw);
  if (source === null) return { raw, name: raw, entries: [] };

  const entries = state.installations.filter((entry) => matchesTapSource(entry, source));
  if (entries.length === 0) return { raw, name: raw, entries: [] };
  return { raw, name: source.name, entries };
}

/** Resolve every argument independently, preserving input order. */
export function resolveStateSubjects(
  state: StateFile,
  rawSubjects: readonly string[],
): readonly StateSubject[] {
  return rawSubjects.map((raw) => resolveStateSubject(state, raw));
}

function parseStateTapRef(raw: string): TapSource | null {
  try {
    const source = parseRef(raw);
    if (source.type !== "tap") return null;
    return source;
  } catch {
    return null;
  }
}

function matchesTapSource(entry: StateEntry, source: TapSource): boolean {
  if (entry.name !== source.name) return false;
  if (source.tap !== null && entry.source.tap !== source.tap) return false;
  if (source.namespace === null) return true;
  return namespaceForEntry(entry) === source.namespace;
}

function namespaceForEntry(entry: StateEntry): string | null {
  const parts = entry.source.path.split("/");
  if (parts.length === 3 && parts[0] === "skills") return parts[1]!;
  return null;
}
