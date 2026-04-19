/**
 * `crew uninstall <name> [<name>...]` (§7.4).
 *
 * Removes each skill from every target listed in state, then updates
 * state.json. Fails with `not_installed_here` if no state entry exists,
 * unless `--force`.
 *
 * With `--target <name>` (repeatable), removal is restricted to the
 * named targets only — other targets keep their installs. If the
 * `--target` filter leaves the entry's `targets` array empty, the
 * entry is removed entirely (same as a default full uninstall).
 *
 * With `--prune` (§7.4 step 5), after removing the named skills, the
 * command recursively uninstalls any remaining skill that was only
 * installed as a transitive dependency (`explicit: false`, empty
 * `required_by`). A partial `--target` removal that leaves the entry
 * alive does NOT trigger pruning — the skill is still installed, so
 * its dependencies are still required. Orphans that trip a safety
 * check are reported and left in place — the user can rerun with
 * `--force --prune` to override.
 */

import { CrewError } from "../core/errors.ts";
import type { StateEntry, StateFile } from "../core/types.ts";
import { readState, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { cwdForEntry, type TargetAdapter } from "../targets/adapter.ts";
import { uninstallSkillFromTarget } from "../targets/install.ts";
import { ALL_ADAPTERS, adapterByName } from "../targets/registry.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

interface Record {
  name: string;
  removedFrom: string[];
  absentFrom: string[];
  failures: { target: string; error: { code: string; message: string } }[];
  /** True if the removal was driven by `--prune`, not by a direct command-line arg. */
  pruned?: boolean;
  /** True if the state entry still survives after this call (partial --target removal). */
  partial?: boolean;
}

export function uninstallCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall` needs at least one skill name — run `crew list` to see what's installed",
    );
  }
  const prune = Boolean(ctx.flags.extras["prune"]);
  const targetFilter = validateTargetFilter(ctx.flags.target);

  const records: Record[] = [];
  let exitCode = 0;

  withStateLock(() => {
    let state = readState(ctx.home);
    for (const name of ctx.positional) {
      const { updatedState, rec } = removeOne(state, name, ctx, false, targetFilter);
      state = updatedState;
      records.push(rec);
      if (rec.failures.length > 0) exitCode = 1;
    }
    if (prune) {
      state = pruneOrphans(state, ctx, records);
    }
    writeState(state, ctx.home);
  }, ctx.home);

  const human: string[] = [];
  for (const r of records) {
    const prefix = r.pruned ? `${r.name} (pruned)` : r.name;
    if (r.failures.length > 0) {
      human.push(
        `${prefix}: FAILED (${r.failures.map((f) => `${f.target}:${f.error.code}`).join(", ")})`,
      );
    } else if (r.partial) {
      human.push(
        `${prefix}: removed from ${r.removedFrom.join(", ") || "(nothing)"} (kept elsewhere)`,
      );
    } else {
      human.push(`${prefix}: removed from ${r.removedFrom.join(", ") || "(nothing)"}`);
    }
  }
  return { exitCode, human, json: { records } };
}

/**
 * Validate `--target` against the adapter registry. An unknown target is
 * a user error — we tell them what's known so they can fix the typo.
 * An empty filter (no `--target` passed) means "remove from every target
 * this skill is currently installed in."
 */
function validateTargetFilter(targets: readonly string[]): readonly string[] | null {
  if (targets.length === 0) return null;
  const unknown = targets.filter((n) => !adapterByName(n));
  if (unknown.length > 0) {
    const known = ALL_ADAPTERS.map((a) => a.name).join(", ");
    throw new CrewError(
      "usage_error",
      `unknown target${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")} — known targets: ${known}`,
      { unknown },
    );
  }
  return targets;
}

/**
 * Remove one named skill. If `targetFilter` is null, removes from every
 * target the skill is on (full uninstall). If non-null, removes only
 * from the named targets; the state entry survives with a reduced
 * `targets` list if any remain.
 */
function removeOne(
  state: StateFile,
  name: string,
  ctx: CommandContext,
  pruned: boolean,
  targetFilter: readonly string[] | null,
): { updatedState: StateFile; rec: Record } {
  const entries = state.installations.filter((e) => e.name === name);
  const rec: Record = {
    name,
    removedFrom: [],
    absentFrom: [],
    failures: [],
    ...(pruned ? { pruned: true } : {}),
  };
  if (entries.length === 0) {
    if (!(ctx.flags.force || pruned)) {
      throw new CrewError(
        "not_installed_here",
        `\`${name}\` isn't in crew's state — nothing to remove`,
        { name },
      );
    }
    return { updatedState: state, rec };
  }
  // Per-entry processing: each (skill, scope) pair potentially touches
  // a different subset of targets.
  let nextState = state;
  let anySurvives = false;
  for (const entry of entries) {
    const targetsToRemove = targetFilter
      ? entry.targets.filter((t) => targetFilter.includes(t))
      : entry.targets;
    removeFromTargets(entry, targetsToRemove, name, ctx, rec);
    const remainingTargets = entry.targets.filter((t) => !targetsToRemove.includes(t));
    if (remainingTargets.length > 0) {
      // Partial removal — entry survives with a reduced targets list.
      nextState = reduceEntryTargets(nextState, name, entry.scope, remainingTargets);
      anySurvives = true;
    } else {
      // Full removal at this (name, scope) pair — drop it.
      nextState = dropScopedEntryAndUpdateRequiredBy(nextState, name, entry.scope);
    }
  }
  if (anySurvives) rec.partial = true;
  return { updatedState: nextState, rec };
}

/** Run the uninstall algorithm for the specified target subset of an entry. */
function removeFromTargets(
  entry: StateEntry,
  targetsToRemove: readonly string[],
  name: string,
  ctx: CommandContext,
  rec: Record,
) {
  // For project-scope entries, the authoritative install location is
  // the entry's recorded `project_root` — NOT `ctx.cwd`. Otherwise
  // running `crew uninstall` from a different directory silently
  // misses (or worse, rm's) the wrong place.
  const entryCwd = cwdForEntry(entry, ctx.cwd);
  for (const targetName of targetsToRemove) {
    const adapter: TargetAdapter | undefined = adapterByName(targetName);
    if (!adapter) continue;
    try {
      const outcome = uninstallSkillFromTarget({
        adapter,
        scope: entry.scope,
        cwd: entryCwd,
        skillName: name,
        force: ctx.flags.force,
      });
      if (outcome === "removed") rec.removedFrom.push(targetName);
      else rec.absentFrom.push(targetName);
    } catch (err) {
      const ce = err as CrewError;
      rec.failures.push({
        target: targetName,
        error: { code: ce.code ?? "usage_error", message: ce.message },
      });
    }
  }
}

/** Replace the (name, scope) entry's `targets` array with `remaining`. */
function reduceEntryTargets(
  state: StateFile,
  name: string,
  scope: StateEntry["scope"],
  remaining: readonly string[],
): StateFile {
  return {
    schema_version: 1,
    installations: state.installations.map((e) =>
      e.name === name && e.scope === scope ? { ...e, targets: [...remaining] } : e,
    ),
  };
}

/** Drop the (name, scope) entry and scrub `name` from every surviving `required_by`. */
function dropScopedEntryAndUpdateRequiredBy(
  state: StateFile,
  name: string,
  scope: StateEntry["scope"],
): StateFile {
  return {
    schema_version: 1,
    installations: state.installations
      .filter((e) => !(e.name === name && e.scope === scope))
      .map((e) => ({ ...e, required_by: e.required_by.filter((n) => n !== name) })),
  };
}

/**
 * Recursively remove any skill that is now an autoremovable orphan:
 * `explicit: false` AND empty `required_by`. Runs until a full pass
 * finds no new orphans. Prune never respects `--target` filters —
 * when we auto-remove a dep, we remove it fully. (A partial removal
 * that leaves the entry alive doesn't trigger pruning in the first
 * place, so by the time we're pruning, we're always fully removing.)
 */
function pruneOrphans(state: StateFile, ctx: CommandContext, records: Record[]): StateFile {
  let current = state;
  let orphan = findOrphan(current);
  while (orphan) {
    const { updatedState, rec } = removeOne(current, orphan.name, ctx, true, null);
    records.push(rec);
    current = updatedState;
    orphan = findOrphan(current);
  }
  return current;
}

function findOrphan(state: StateFile): StateEntry | undefined {
  return state.installations.find((e) => !e.explicit && e.required_by.length === 0);
}
