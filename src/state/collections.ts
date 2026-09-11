/**
 * Collection selector resolution for state-oriented commands (§7.4, §10.1).
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
 *      the caller can raise its own not-found error with the raw text.
 *
 * A bare word that is both a tap and a namespace elsewhere, or a namespace
 * present in several taps, throws `ambiguous_reference` listing each
 * qualified form. `crew uninstall` and `crew update` both consume this;
 * the `command` argument only picks the verb shown in that error's
 * copy-pasteable suggestions.
 *
 * Callers that target a single scope (`crew uninstall`, §7.4 "Scope")
 * pass a pre-narrowed `state` so tap and namespace membership — and the
 * ambiguity decision that follows from it — only ever considers entries
 * the command could actually remove.
 */

import { CrewError } from "../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../core/types.ts";
import { namespaceForEntry, resolveStateSubject, type StateSubject } from "./subjects.ts";

export type CollectionKind = "skill" | "tap" | "namespace";

export interface CollectionSubject extends StateSubject {
  readonly kind: CollectionKind;
}

/**
 * Resolve one argument to an installed skill, a tap, or a namespace.
 *
 * `skillState` is what skill-kind resolution sees; `collectionState`
 * (defaulting to it) is what tap/namespace membership sees. `crew
 * uninstall` passes the full state for the former so a cross-scope skill
 * keeps its "it's installed over here" remedy, and a scope-narrowed state
 * for the latter.
 */
export function resolveCollectionSubject(
  state: StateFile,
  config: Config,
  raw: string,
  command: string = "uninstall",
  collectionState: StateFile = state,
): CollectionSubject {
  const skill = resolveStateSubject(state, raw);
  if (skill.entries.length > 0) return { ...skill, kind: "skill" };

  const lowered = raw.trim().toLowerCase();
  const tapNamed = config.taps.some((t) => t.name === lowered);
  const namespaced = namespaceCandidates(collectionState, lowered);

  if (tapNamed && namespaced.length > 0) {
    throw ambiguousCollection(raw, [lowered, ...namespaced.map((c) => c.qualified)], command);
  }
  if (tapNamed) {
    const entries = collectionState.installations.filter((e) => e.source.tap === lowered);
    return { raw, name: lowered, kind: "tap", entries };
  }
  if (namespaced.length > 1) {
    throw ambiguousCollection(
      raw,
      namespaced.map((c) => c.qualified),
      command,
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
  command: string = "uninstall",
  collectionState: StateFile = state,
): readonly CollectionSubject[] {
  return rawSubjects.map((raw) =>
    resolveCollectionSubject(state, config, raw, command, collectionState),
  );
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

function ambiguousCollection(raw: string, forms: readonly string[], command: string): CrewError {
  const lines = [
    `\`${raw}\` matches more than one collection of installed skills`,
    "",
    "  Rerun with one of:",
    "",
    ...forms.map((f) => `    crew ${command} ${f}`),
    "",
  ];
  return new CrewError("ambiguous_reference", lines.join("\n"), { name: raw, candidates: forms });
}
