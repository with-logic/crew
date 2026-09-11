/**
 * Collection selector resolution for state-oriented commands (§10.1).
 *
 * Extends the installed-skill selectors of `./subjects.ts` so a command
 * argument may also name a *collection* of installed entries: a configured
 * tap (`acme`) or a namespace (`acme/marketing`, or bare `marketing` when
 * only one tap has installed entries under it). Resolution order per
 * argument, mirroring `crew install <tap>` (§16.4):
 *
 *   1. installed skill (bare or tap-qualified) — always wins;
 *   2. configured tap name — every entry attributed to that tap, or an
 *      empty set when nothing is installed from it (not an error);
 *   3. namespace — `<tap>/<ns>` or bare `<ns>` unique across taps;
 *   4. otherwise an unmatched `skill`-kind subject with no entries, so
 *      the caller can raise `unknown_skill` with the raw text.
 *
 * A bare word that is both a tap and a namespace elsewhere, or a namespace
 * present in several taps, throws `ambiguous_reference` listing each
 * qualified form. `crew update` consumes this today; `crew uninstall` is
 * expected to share it.
 */

import { CrewError } from "../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../core/types.ts";
import { namespaceForEntry, resolveStateSubject, type StateSubject } from "./subjects.ts";

export type CollectionKind = "skill" | "tap" | "namespace";

export interface CollectionSubject extends StateSubject {
  readonly kind: CollectionKind;
}

/**
 * A state entry's full identity (§11.1): `(tap, path, name, scope,
 * project_root)`. Name alone is not an identity — the same skill name
 * can be installed from two taps, and at user plus several project
 * scopes. Anything re-reading entries across a state mutation must key
 * on this, or it will capture entries the user never selected.
 */
export function entryIdentity(entry: StateEntry): string {
  return [
    entry.source.tap,
    entry.source.path,
    entry.name,
    entry.scope,
    entry.project_root ?? "",
  ].join("::");
}

/** Resolve one argument to an installed skill, a tap, or a namespace. */
export function resolveCollectionSubject(
  state: StateFile,
  config: Config,
  raw: string,
): CollectionSubject {
  const skill = resolveStateSubject(state, raw);
  if (skill.entries.length > 0) return { ...skill, kind: "skill" };

  const lowered = raw.trim().toLowerCase();
  const tapNamed = config.taps.some((t) => t.name === lowered);
  const namespaced = namespaceCandidates(state, lowered);

  if (tapNamed && namespaced.length > 0) {
    throw ambiguousCollection(raw, [lowered, ...namespaced.map((c) => c.qualified)]);
  }
  if (tapNamed) {
    const entries = state.installations.filter((e) => e.source.tap === lowered);
    return { raw, name: lowered, kind: "tap", entries };
  }
  if (namespaced.length > 1) {
    throw ambiguousCollection(
      raw,
      namespaced.map((c) => c.qualified),
    );
  }
  const only = namespaced[0];
  if (only) return { raw, name: only.namespace, kind: "namespace", entries: only.entries };
  return { raw, name: raw, kind: "skill", entries: [] };
}

/** Resolve every argument independently, preserving input order. */
export function resolveCollectionSubjects(
  state: StateFile,
  config: Config,
  rawSubjects: readonly string[],
): readonly CollectionSubject[] {
  return rawSubjects.map((raw) => resolveCollectionSubject(state, config, raw));
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
    // Namespace membership was already narrowed to one tap at first
    // resolution; keep that tap so a namespace of the same name
    // appearing elsewhere can't widen the set. Scope is pinned the same
    // way: a namespace resolved against user-scope entries must not
    // absorb a project-scope install that appears mid-run.
    const taps = new Set(subject.entries.map((e) => e.source.tap));
    const scopes = new Set(subject.entries.map((e) => `${e.scope}::${e.project_root ?? ""}`));
    return state.installations.filter(
      (e) =>
        namespaceForEntry(e) === subject.name &&
        taps.has(e.source.tap) &&
        scopes.has(`${e.scope}::${e.project_root ?? ""}`),
    );
  }
  // A skill selector is bound to the exact entries it resolved to, by
  // full identity. Matching on name alone would let a same-named skill
  // from another tap — or the same skill at another scope — join the
  // selection when re-expansion adds one mid-run (§10.1).
  const identities = new Set(subject.entries.map(entryIdentity));
  return state.installations.filter((e) => identities.has(entryIdentity(e)));
}

interface NamespaceCandidate {
  readonly tap: string;
  readonly namespace: string;
  readonly qualified: string;
  readonly entries: readonly StateEntry[];
}

/**
 * Installed namespaces matching `lowered`, grouped by tap. A qualified
 * `<tap>/<ns>` form yields at most one candidate; a bare `<ns>` yields
 * one per tap that has installed entries under it.
 */
function namespaceCandidates(state: StateFile, lowered: string): NamespaceCandidate[] {
  const parts = lowered.split("/");
  if (parts.length > 2) return [];
  const tapFilter = parts.length === 2 ? parts[0]! : null;
  const namespace = parts[parts.length - 1]!;
  const byTap = new Map<string, StateEntry[]>();
  for (const entry of state.installations) {
    if (tapFilter !== null && entry.source.tap !== tapFilter) continue;
    if (namespaceForEntry(entry) !== namespace) continue;
    if (!byTap.has(entry.source.tap)) byTap.set(entry.source.tap, []);
    byTap.get(entry.source.tap)!.push(entry);
  }
  return [...byTap.entries()].map(([tap, entries]) => ({
    tap,
    namespace,
    qualified: `${tap}/${namespace}`,
    entries,
  }));
}

function ambiguousCollection(raw: string, forms: readonly string[]): CrewError {
  const lines = [
    `\`${raw}\` matches more than one collection of installed skills`,
    "",
    "  Rerun with one of:",
    "",
    ...forms.map((f) => `    crew update ${f}`),
    "",
  ];
  return new CrewError("ambiguous_reference", lines.join("\n"), { name: raw, candidates: forms });
}
