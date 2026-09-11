/**
 * Entry selection helpers for `crew update` (§10.1).
 *
 * The command entry point orchestrates refresh/re-expand/update work;
 * this module owns installed-subject and dependency-closure selection
 * so the command file stays small. Subjects may be single skills or
 * collections (tap / namespace, see `state/collections.ts`); a collection
 * simply contributes every entry it expanded to.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import type { ReexpandSelection } from "../../install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { type CollectionSubject, entryIdentity } from "../../state/collections.ts";

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
 * No subjects: every configured tap (full refresh — matches
 * `crew update` with no args).
 *
 * With subjects: the taps backing every entry in the expanded update
 * set (direct selections + dep closure), plus any tap the user named
 * *as a tap*. Taps are taken from `subject.kind === "tap"` rather than
 * from resolved skill names, so a skill sharing a tap's name never
 * drags that unrelated tap into the refresh (§10.1).
 */
export function tapsToRefreshFor(
  config: Config,
  subjects: readonly CollectionSubject[],
  expandedSelection: readonly StateEntry[],
): TapConfig[] {
  if (subjects.length === 0) return [...config.taps];
  const wantedTapNames = new Set<string>();
  for (const e of expandedSelection) {
    wantedTapNames.add(e.source.tap);
  }
  for (const subject of subjects) {
    if (subject.kind === "tap") wantedTapNames.add(subject.name);
  }
  return config.taps.filter((t) => wantedTapNames.has(t.name));
}

/**
 * Split the resolved subjects into what re-expansion needs: the full
 * identity of every selected member on one side, tap-kind selections on
 * the other. Returns `null` for "no positionals", meaning every group.
 *
 * Members are carried as identities rather than names because one name
 * can exist in several taps and at several scopes; matching by name
 * would re-expand groups the user never selected (§10.1).
 */
export function reexpandSelectionFor(
  subjects: readonly CollectionSubject[],
  expandedSelection: readonly StateEntry[],
): ReexpandSelection | null {
  if (subjects.length === 0) return null;
  const memberIdentities = new Set<string>();
  for (const entry of expandedSelection) memberIdentities.add(entryIdentity(entry));
  const tapNames = new Set<string>();
  for (const subject of subjects) {
    if (subject.kind === "tap") tapNames.add(subject.name);
  }
  return { memberIdentities, tapNames };
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
export function chooseEntries(
  state: StateFile,
  subjects: readonly CollectionSubject[],
): ChosenEntries {
  if (subjects.length === 0) {
    return { entries: [...state.installations], transitiveSources: new Map() };
  }
  for (const subject of subjects) {
    // A tap with nothing installed from it is a legitimate (empty)
    // collection — only an unmatched skill-shaped argument is an error.
    if (subject.kind === "skill" && subject.entries.length === 0) {
      throw new CrewError(
        "unknown_skill",
        `\`${subject.raw}\` isn't an installed skill, a tap, or a namespace — run \`crew list\` to see what Homecrew is tracking, or \`crew tap list\` for your taps`,
        { name: subject.raw },
      );
    }
  }

  // Closure seeds are the skill names the subjects expanded to, so a
  // tap or namespace selector behaves as if each member were named.
  const names = [...new Set(subjects.flatMap((subject) => subject.entries.map((e) => e.name)))];
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
  // Cursor rather than `shift()`: shifting re-indexes the whole array
  // on every step.
  const queue = names.map((name) => ({ name, rootedAt: name }));
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { name, rootedAt } = queue[cursor]!;
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
function orderedEntries(
  state: StateFile,
  subjects: readonly CollectionSubject[],
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
