/**
 * Entry selection helpers for `crew update` (§10.1).
 *
 * The command entry point orchestrates refresh/re-expand/update work;
 * this module owns installed-subject and dependency-closure selection
 * so the command file stays small.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import type { StateSubject } from "../../state/subjects.ts";

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

interface DependencyClosure {
  readonly selectedNames: ReadonlySet<string>;
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
 * user named it directly (`crew update <tap-name>`). Other taps are
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
  // `names` are resolved skill names, not raw inputs. Qualified refs
  // refresh through `expandedSelection`; this preserves bare tap-name
  // updates.
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
 * Select entries for the update run, expanding named entries with
 * their transitive dependency closure.
 */
export function chooseEntries(state: StateFile, subjects: readonly StateSubject[]): ChosenEntries {
  if (subjects.length === 0) {
    return { entries: [...state.installations], transitiveSources: new Map() };
  }
  for (const subject of subjects) {
    if (subject.entries.length === 0) {
      throw new CrewError(
        "unknown_skill",
        `\`${subject.raw}\` isn't installed — run \`crew list\` to see what Homecrew is tracking`,
        { name: subject.raw },
      );
    }
  }

  const names = subjects.map((subject) => subject.name);
  const topLevel = new Set(names);
  const closure = dependencyClosureFor(state, names, topLevel);
  const entries = orderedEntries(state, subjects, closure.selectedNames, topLevel);
  return { entries, transitiveSources: closure.transitiveSources };
}

function dependencyClosureFor(
  state: StateFile,
  names: readonly string[],
  topLevel: ReadonlySet<string>,
): DependencyClosure {
  const selectedNames = new Set<string>();
  const ancestors = new Map<string, Set<string>>();
  const visited = new Set<string>();
  const queue = names.map((name) => ({ name, rootedAt: name }));
  while (queue.length > 0) {
    const { name, rootedAt } = queue.shift()!;
    const firstVisit = !visited.has(name);
    visited.add(name);
    selectedNames.add(name);
    if (!topLevel.has(name)) {
      if (!ancestors.has(name)) ancestors.set(name, new Set());
      ancestors.get(name)!.add(rootedAt);
    }
    if (!firstVisit) continue;
    for (const candidate of state.installations) {
      if (candidate.required_by.includes(name)) {
        queue.push({ name: candidate.name, rootedAt });
      }
    }
  }
  const transitiveSources = new Map<string, readonly string[]>();
  for (const [name, set] of ancestors) transitiveSources.set(name, [...set].sort());
  return { selectedNames, transitiveSources };
}

/** Preserve the user's requested entries first, then append dependency entries in state order. */
function orderedEntries(
  state: StateFile,
  subjects: readonly StateSubject[],
  selectedNames: ReadonlySet<string>,
  topLevel: ReadonlySet<string>,
): readonly StateEntry[] {
  const entries: StateEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: StateEntry) => {
    const key = entryKey(entry);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  for (const subject of subjects) {
    for (const entry of subject.entries) add(entry);
  }
  for (const entry of state.installations) {
    if (!selectedNames.has(entry.name) || topLevel.has(entry.name)) continue;
    add(entry);
  }
  return entries;
}

function entryKey(entry: StateEntry): string {
  return `${entry.name}::${entry.scope}::${entry.project_root ?? ""}`;
}
