/**
 * Entry selection helpers for `crew update` (§10.1).
 *
 * The command entry point orchestrates refresh/re-expand/update work;
 * this module owns installed-subject and dependency-closure selection
 * so the command file stays small. Subjects may be single skills or
 * collections (tap / namespace, see `state/collections/index.ts`); a collection
 * simply contributes every entry it expanded to.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import type { ReexpandSelection } from "../../install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import {
  type CollectionSubject,
  entryIdentity,
  refreshCollectionSubjects,
} from "../../state/collections/index.ts";
import { dependencyClosureFor, orderedEntries } from "./dep-closure.ts";

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
  const namespaces = new Set<string>();
  let unbounded = false;
  for (const subject of subjects) {
    if (subject.kind === "tap") {
      tapNames.add(subject.name);
      // Naming a tap asks for the whole tap, so additions are unbounded.
      unbounded = true;
      continue;
    }
    if (subject.kind === "namespace") {
      // `<tap>/<ns>` resolves with the tap qualifier still attached;
      // the namespace is the last segment either way.
      namespaces.add(subject.name.split("/").pop()!);
      continue;
    }
    // A skill selector says nothing about which namespaces are in
    // scope, so it cannot bound additions on its own.
    unbounded = true;
  }
  return { memberIdentities, tapNames, namespaces: unbounded ? null : namespaces };
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

/** Keep step 2's dependency identities while adding step 2b's collection members (§10.1). */
export function entriesAfterReexpansion(
  state: StateFile,
  subjects: readonly CollectionSubject[],
  initialSelected: readonly StateEntry[],
): readonly StateEntry[] {
  if (subjects.length === 0) return [...state.installations];
  const initialIdentities = new Set(initialSelected.map(entryIdentity));
  const entries: StateEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: StateEntry) => {
    const key = entryIdentity(entry);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  for (const subject of refreshCollectionSubjects(state, subjects)) {
    for (const entry of subject.entries) add(entry);
  }
  for (const entry of state.installations) {
    if (initialIdentities.has(entryIdentity(entry))) add(entry);
  }
  return entries;
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
