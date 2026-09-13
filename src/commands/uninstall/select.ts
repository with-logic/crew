/**
 * Subject selection for `crew uninstall` (§5.3.1, §7.4).
 *
 * Turns the command line into the list of targets `./index.ts` removes:
 *
 *   - positionals → collection selectors (installed skill, tap, or
 *     namespace) narrowed to the targeted scope;
 *   - `--all` → every installed entry at the targeted scope, one target
 *     per skill name.
 *
 * Two invariants matter here. A collection selector consults two states:
 * *which* collection a bare name means is decided among entries this
 * command could remove, so a namespace colliding only with an
 * out-of-scope install is unambiguous; *what* that collection contains is
 * then re-read from full state and narrowed, so §7.4's lone-project
 * fallback applies per selected collection rather than across every
 * install on the machine. And the final target list is deduplicated by
 * installed-entry identity, because overlapping selectors (`crew
 * uninstall acme alpha`) would otherwise remove a skill once and then
 * fail trying to remove it again.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, Scope, StateEntry, StateFile } from "../../core/types.ts";
import { type CollectionKind, resolveCollectionSubjects } from "../../state/collections.ts";
import { entryKey } from "../../state/identity.ts";
import { namespaceForEntry, type StateSubject } from "../../state/subjects.ts";
import { plural, shortenHome } from "../../util/format.ts";
import type { CommandContext } from "../types.ts";
import { entriesAtScope, narrowSubjectToScope } from "./scope.ts";

/**
 * One skill to remove. `removeOne` works on a single skill name, so a
 * collection selector contributes one target per distinct name.
 *
 * The two variants differ in what an empty entry set means. A `skill`
 * target with no entries is `not_installed_here`; a `collection` target
 * with none is reported and exits 0, because asking to remove skills
 * from a tap you have none of is not an error (§7.4). Modelling that as
 * a discriminated union keeps an ordinary missing selector from ever
 * being silently tolerated.
 */
export type UninstallTarget =
  | { readonly kind: "skill"; readonly subject: StateSubject }
  | {
      readonly kind: "collection";
      readonly subject: StateSubject;
      readonly collection: { readonly kind: CollectionKind; readonly name: string };
    };

/** True when an empty entry set is reportable rather than an error. */
export function allowsEmpty(target: UninstallTarget): boolean {
  return target.kind === "collection";
}

/** Resolve the positional selectors, each narrowed to the target scope. */
export function selectedTargets(
  ctx: CommandContext,
  state: StateFile,
  config: Config,
): readonly UninstallTarget[] {
  // Two different questions, so two different states.
  //
  // WHICH collection a bare name means is decided against entries this
  // command could remove (§7.4 "Scope"): a namespace that collides only
  // with an out-of-scope install is not ambiguous.
  //
  // WHAT that collection contains is then taken from full state, because
  // §7.4's lone-project fallback asks whether the *selected collection*
  // has exactly one project install — not whether the machine does.
  // Deciding membership on scoped state let an unrelated project install
  // of a different tap silence the removal: it exited 0 having removed
  // nothing, which reads as success.
  const scoped: StateFile = {
    schema_version: state.schema_version,
    installations: entriesAtScope(state.installations, ctx.flags.scope, ctx.cwd),
  };
  const resolved = resolveCollectionSubjects(state, config, ctx.positional, "uninstall", scoped);
  const targets: UninstallTarget[] = [];
  for (const subject of resolved) {
    if (subject.kind === "skill") {
      // Only skill selectors carry the where-is-it remedy for a scope miss.
      targets.push({
        kind: "skill",
        subject: narrowSubjectToScope(subject, ctx.flags.scope, ctx.cwd, ctx.flags.force),
      });
      continue;
    }
    const collection: { readonly kind: CollectionKind; readonly name: string } = {
      kind: subject.kind,
      name: subject.name,
    };
    const groups = groupByName(entriesForCollection(collection, state, ctx));
    for (const group of groups) targets.push({ kind: "collection", subject: group, collection });
    if (groups.length === 0) {
      targets.push({ kind: "collection", subject: { ...subject, entries: [] }, collection });
    }
  }
  return dedupe(targets);
}

/**
 * Every installed skill at the target scope, one target per name. Throws
 * when there is nothing to do; confirmation is the caller's job, since it
 * must happen before the state lock is taken.
 */
export function allTargets(ctx: CommandContext, state: StateFile): readonly UninstallTarget[] {
  const entries = entriesAtScope(state.installations, ctx.flags.scope, ctx.cwd);
  if (entries.length === 0) {
    throw new CrewError(
      "not_installed_here",
      `nothing is installed at ${describeScope(ctx.flags.scope, ctx.cwd)} — nothing to remove`,
      { scope: ctx.flags.scope },
    );
  }
  return groupByName(entries).map((subject) => ({ kind: "skill", subject }) as const);
}

/**
 * Reject `--all` combined with positionals, then count what it would
 * remove so the caller can confirm before locking. Returns the number of
 * distinct skills, or throws when nothing is installed at this scope.
 */
export function countAllTargets(ctx: CommandContext, state: StateFile): number {
  if (ctx.positional.length > 0) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall --all` takes no skill names — it removes everything at the target scope",
      { positional: [...ctx.positional] },
    );
  }
  return allTargets(ctx, state).length;
}

/**
 * Drop targets whose entries a previous target already covers. Selectors
 * may overlap (`crew uninstall acme alpha`, where `alpha` is in `acme`);
 * without this the second removal finds the directory already gone and
 * reports a failure for work that succeeded.
 */
function dedupe(targets: readonly UninstallTarget[]): readonly UninstallTarget[] {
  const seen = new Set<string>();
  const out: UninstallTarget[] = [];
  for (const target of targets) {
    const remaining = target.subject.entries.filter((e) => !seen.has(entryKey(e)));
    // A collection that is now fully covered contributes nothing; an
    // empty collection selector still reports "nothing installed".
    if (remaining.length === 0 && target.subject.entries.length > 0) continue;
    for (const e of remaining) seen.add(entryKey(e));
    out.push({ ...target, subject: { ...target.subject, entries: remaining } });
  }
  return out;
}

/**
 * The entries a resolved collection should remove, scoped to the target.
 *
 * The collection was identified against scoped state (so ambiguity is
 * decided among removable entries), but its membership is re-taken from
 * full state so `entriesAtScope` can apply §7.4's lone-project fallback
 * to this collection alone.
 */
function entriesForCollection(
  subject: { readonly kind: CollectionKind; readonly name: string },
  state: StateFile,
  ctx: CommandContext,
): readonly StateEntry[] {
  const all = state.installations.filter((e) =>
    subject.kind === "tap" ? e.source.tap === subject.name : namespaceForEntry(e) === subject.name,
  );
  return entriesAtScope(all, ctx.flags.scope, ctx.cwd);
}

/** One subject per distinct skill name, preserving state order. */
function groupByName(entries: readonly StateEntry[]): StateSubject[] {
  const byName = new Map<string, StateEntry[]>();
  for (const entry of entries) {
    if (!byName.has(entry.name)) byName.set(entry.name, []);
    byName.get(entry.name)!.push(entry);
  }
  return [...byName.entries()].map(([name, group]) => ({ raw: name, name, entries: group }));
}

/** Gate `--all` behind `--yes` or an interactive confirmation. */
export function confirmAll(ctx: CommandContext, count: number): void {
  if (ctx.flags.yes) return;
  const scope = describeScope(ctx.flags.scope, ctx.cwd);
  const answer = ctx.prompt(`Remove ${plural(count, "skill")} from ${scope}? [y/N]: `);
  if (answer === "yes") return;
  if (answer === "no") {
    throw new CrewError("usage_error", "Aborted — nothing was removed", { scope: ctx.flags.scope });
  }
  throw new CrewError(
    "usage_error",
    "`crew uninstall --all` needs confirmation, but stdin isn't a terminal — pass `--yes` to confirm",
    { scope: ctx.flags.scope },
  );
}

function describeScope(scope: Scope, cwd: string): string {
  return scope === "user" ? "user scope" : `project scope in ${shortenHome(cwd)}`;
}
