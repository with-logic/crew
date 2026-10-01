/** Preserve selected collection identity across state mutations (§10.1, §11.1). */
import type { StateEntry, StateFile } from "../../core/types.ts";
import { namespaceForEntry } from "../subjects.ts";
import type { CollectionSubject } from "./types.ts";

/**
 * A state entry's identity (§11.1): `(tap, name, scope, project_root)`.
 * Name alone is not an identity — the same skill name can be installed
 * from two taps, and at user plus several project scopes. Anything
 * re-reading entries across a state mutation must key on this, or it
 * will capture entries the user never selected.
 *
 * `source.path` is deliberately NOT part of the identity. A skill
 * relocated upstream keeps the same install; re-expansion rewrites its
 * path mid-run (§10.1.1), so including the path would make the entry
 * fail to match itself after relocation and silently drop out of the
 * selection, leaving stale bytes installed.
 */
export function entryIdentity(entry: StateEntry): string {
  return [entry.source.tap, entry.name, entry.scope, entry.project_root ?? ""].join("::");
}

/**
 * Re-read each subject's entries against a newer `state` **without**
 * re-interpreting what the argument meant.
 *
 * `crew update` mutates state mid-run (tap re-expansion installs new
 * children), then needs the post-mutation entry set. Re-resolving the
 * raw strings there would let a selector change kind — a tap selector
 * becomes a skill selector the moment re-expansion adds a child sharing
 * the tap's name, because skill resolution wins. Identity is fixed at
 * first resolution; only membership is recomputed (§10.1).
 */
export function refreshCollectionSubjects(
  state: StateFile,
  subjects: readonly CollectionSubject[],
): readonly CollectionSubject[] {
  return subjects.map((subject) => ({ ...subject, entries: entriesFor(state, subject) }));
}

function entriesFor(state: StateFile, subject: CollectionSubject): readonly StateEntry[] {
  if (subject.kind === "tap") {
    return state.installations.filter((e) => e.source.tap === subject.name);
  }
  if (subject.kind === "namespace") {
    // Namespace membership was already narrowed to one tap and scope at
    // first resolution, so it is re-derived rather than re-matched by
    // name: a namespace of the same name elsewhere must not widen the
    // set, and a project-scope install appearing mid-run must not be
    // absorbed into a user-scope selection.
    //
    // Entries already resolved are carried by identity rather than
    // re-tested against `namespaceForEntry`. Re-expansion rewrites a
    // relocated skill's tap-relative path in this very run (§10.1.1),
    // so re-testing would drop a member that merely MOVED namespaces
    // out of the selection, leaving stale bytes installed (§11.1).
    const resolved = new Set(subject.entries.map(entryIdentity));
    const taps = new Set(subject.entries.map((e) => e.source.tap));
    const scopes = new Set(subject.entries.map((e) => `${e.scope}::${e.project_root ?? ""}`));
    return state.installations.filter(
      (e) =>
        resolved.has(entryIdentity(e)) ||
        (namespaceForEntry(e) === subject.name &&
          taps.has(e.source.tap) &&
          scopes.has(`${e.scope}::${e.project_root ?? ""}`)),
    );
  }
  // A skill selector is bound to the exact entries it resolved to, by
  // full identity. Matching on name alone would let a same-named skill
  // from another tap — or the same skill at another scope — join the
  // selection when re-expansion adds one mid-run (§10.1).
  const identities = new Set(subject.entries.map(entryIdentity));
  return state.installations.filter((e) => identities.has(entryIdentity(e)));
}
