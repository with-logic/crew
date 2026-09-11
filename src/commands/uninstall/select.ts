/**
 * Subject selection for `crew uninstall` (§5.3.1, §7.4).
 *
 * Turns the command line into the list of subjects `./index.ts` removes:
 *
 *   - positionals → collection selectors (installed skill, tap, or
 *     namespace) narrowed to the targeted scope;
 *   - `--all` → every installed entry at the targeted scope, one subject
 *     per skill name, behind a confirmation.
 *
 * `--all` is the only destructive-by-default shape crew has, so it
 * requires `--yes` or an interactive confirmation. A non-TTY run without
 * `--yes` is a `usage_error` rather than a silent mass removal.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, Scope, StateEntry, StateFile } from "../../core/types.ts";
import { type CollectionKind, resolveCollectionSubjects } from "../../state/collections.ts";
import type { StateSubject } from "../../state/subjects.ts";
import { plural, shortenHome } from "../../util/format.ts";
import type { CommandContext } from "../types.ts";
import { narrowSubjectToScope } from "./scope.ts";

/**
 * One skill to remove. `removeOne` works on a single skill name, so a
 * collection selector contributes one target per distinct name, all
 * tagged with the collection they came from.
 */
export interface UninstallTarget {
  readonly subject: StateSubject;
  /** Set when this target came from a tap or namespace selector. */
  readonly collection?: { readonly kind: CollectionKind; readonly name: string };
  /**
   * True when an empty entry set is not an error: a configured tap or
   * namespace that currently has nothing installed at this scope is
   * reported, not failed (§7.4).
   */
  readonly allowEmpty?: boolean;
}

/** Resolve the positional selectors, each narrowed to the target scope. */
export function selectedTargets(
  ctx: CommandContext,
  state: StateFile,
  config: Config,
): readonly UninstallTarget[] {
  const resolved = resolveCollectionSubjects(state, config, ctx.positional);
  const targets: UninstallTarget[] = [];
  for (const subject of resolved) {
    if (subject.kind === "skill") {
      // §7.4 "Scope": a selector only ever targets one scope. Only skill
      // selectors carry the where-is-it remedy for a scope miss.
      targets.push({
        subject: narrowSubjectToScope(subject, ctx.flags.scope, ctx.cwd, ctx.flags.force),
      });
      continue;
    }
    const entries = entriesAtScope(subject.entries, ctx.flags.scope, ctx.cwd);
    const collection = { kind: subject.kind, name: subject.name };
    for (const group of groupByName(entries)) targets.push({ subject: group, collection });
    if (entries.length === 0) {
      targets.push({ subject: { ...subject, entries: [] }, collection, allowEmpty: true });
    }
  }
  return targets;
}

/**
 * Every installed skill at the target scope, one target per name.
 * Throws when the user hasn't confirmed, or when there is nothing to do.
 */
export function allTargets(ctx: CommandContext, state: StateFile): readonly UninstallTarget[] {
  if (ctx.positional.length > 0) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall --all` takes no skill names — it removes everything at the target scope",
      { positional: [...ctx.positional] },
    );
  }
  const entries = entriesAtScope(state.installations, ctx.flags.scope, ctx.cwd);
  if (entries.length === 0) {
    throw new CrewError(
      "not_installed_here",
      `nothing is installed at ${describeScope(ctx.flags.scope, ctx.cwd)} — nothing to remove`,
      { scope: ctx.flags.scope },
    );
  }
  const groups = groupByName(entries);
  confirmAll(ctx, groups.length);
  return groups.map((subject) => ({ subject }));
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
function confirmAll(ctx: CommandContext, count: number): void {
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

/** The entries a scope targets: user-scope, or this project root's. */
function entriesAtScope(
  entries: readonly StateEntry[],
  scope: Scope,
  cwd: string,
): readonly StateEntry[] {
  if (scope === "user") return entries.filter((e) => e.scope === "user");
  return entries.filter((e) => e.scope === "project" && e.project_root === cwd);
}

function describeScope(scope: Scope, cwd: string): string {
  return scope === "user" ? "user scope" : `project scope in ${shortenHome(cwd)}`;
}
