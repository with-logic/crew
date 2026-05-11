/**
 * Entry selection helpers for `crew update` (§10.1).
 *
 * The command entry point orchestrates refresh/re-expand/update work;
 * this module owns the named-entry and dependency-closure selection
 * logic so the command file stays small.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import type { UpdateRow } from "../../install/update-one.ts";

/** Expanded update set + per-entry "who pulled you in" map. */
export interface ChosenEntries {
  readonly entries: readonly StateEntry[];
  /**
   * For every entry added only via dep closure, the list of top-level
   * names that transitively required it. A name in this map is never
   * one of the command-line positionals.
   */
  readonly transitiveSources: ReadonlyMap<string, readonly string[]>;
}

/**
 * Compute the set of tap configs whose clones this run needs fresh.
 *
 * Empty `names`: every configured tap (full refresh — matches
 * `crew update` with no args).
 *
 * Non-empty `names`: the taps backing every entry in the expanded
 * update set (direct names + dep closure), plus the tap itself if the
 * user named it directly (`crew update <tap-name>`). Other taps
 * untouched.
 */
export function tapsToRefreshFor(
  config: Config,
  names: readonly string[],
  expandedSelection: readonly StateEntry[],
): TapConfig[] {
  if (names.length === 0) return [...config.taps];
  const wantedTapNames = new Set<string>();
  for (const e of expandedSelection) {
    wantedTapNames.add(e.source.tap);
  }
  for (const n of names) {
    if (config.taps.some((t) => t.name === n)) wantedTapNames.add(n);
  }
  return config.taps.filter((t) => wantedTapNames.has(t.name));
}

/** Attach `transitively_required_by` to a row when the entry is in the closure map. */
export function withTransitive(
  row: UpdateRow,
  transitiveSources: ReadonlyMap<string, readonly string[]>,
): UpdateRow {
  const parents = transitiveSources.get(row.name);
  if (!parents || parents.length === 0) return row;
  return { ...row, transitively_required_by: parents };
}

/**
 * Select entries for the update run, expanding named entries with their
 * transitive dependency closure.
 *
 * Deps are derived from state alone: a skill `bar` is a dependency of
 * `foo` iff `bar.required_by` contains `"foo"` (§11.1). This works
 * without reading SKILL.md from disk.
 */
export function chooseEntries(state: StateFile, names: readonly string[]): ChosenEntries {
  if (names.length === 0) {
    return { entries: [...state.installations], transitiveSources: new Map() };
  }
  for (const name of names) {
    if (!state.installations.some((e) => e.name === name)) {
      throw new CrewError(
        "unknown_skill",
        `\`${name}\` isn't installed — run \`crew list\` to see what Homecrew is tracking`,
        { name },
      );
    }
  }

  const topLevel = new Set(names);
  const selectedNames = new Set<string>();
  const ancestors = new Map<string, Set<string>>();
  const queue: { name: string; rootedAt: string }[] = [];
  for (const name of names) queue.push({ name, rootedAt: name });

  while (queue.length > 0) {
    const { name, rootedAt } = queue.shift()!;
    const firstVisit = !selectedNames.has(name);
    selectedNames.add(name);
    if (!topLevel.has(name)) {
      if (!ancestors.has(name)) ancestors.set(name, new Set());
      ancestors.get(name)!.add(rootedAt);
    }
    if (!firstVisit) continue;
    for (const candidate of state.installations) {
      if (candidate.required_by.includes(name)) queue.push({ name: candidate.name, rootedAt });
    }
  }

  return {
    entries: selectedEntries(state.installations, names, selectedNames, topLevel),
    transitiveSources: transitiveMap(ancestors),
  };
}

function selectedEntries(
  installations: readonly StateEntry[],
  names: readonly string[],
  selectedNames: ReadonlySet<string>,
  topLevel: ReadonlySet<string>,
): StateEntry[] {
  const entries: StateEntry[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    for (const e of installations) {
      if (e.name === n) pushEntry(entries, seen, e);
    }
  }
  for (const e of installations) {
    if (selectedNames.has(e.name) && !topLevel.has(e.name)) pushEntry(entries, seen, e);
  }
  return entries;
}

function pushEntry(entries: StateEntry[], seen: Set<string>, entry: StateEntry): void {
  const key = `${entry.name}::${entry.scope}::${entry.project_root ?? ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push(entry);
}

function transitiveMap(ancestors: ReadonlyMap<string, ReadonlySet<string>>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [name, set] of ancestors) out.set(name, [...set].sort());
  return out;
}
