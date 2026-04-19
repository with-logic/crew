/**
 * Core removal primitives for `crew uninstall`.
 *
 * `removeOne` takes a state snapshot and a single skill name, runs the
 * per-target uninstall, and returns the updated state plus a record of
 * what happened. The command entry point (`./index.ts`) orchestrates
 * the loop over positional args and optional pruning.
 */

import { CrewError } from "../../core/errors.ts";
import type { StateEntry, StateFile } from "../../core/types.ts";
import { cwdForEntry, type TargetAdapter } from "../../targets/adapter.ts";
import { uninstallSkillFromTarget } from "../../targets/install.ts";
import { adapterByName } from "../../targets/registry.ts";
import type { CommandContext } from "../types.ts";
import { dropScopedEntryAndUpdateRequiredBy, reduceEntryTargets } from "./state.ts";

export interface UninstallRecord {
  name: string;
  removedFrom: string[];
  absentFrom: string[];
  failures: { target: string; error: { code: string; message: string } }[];
  /** True if the removal was driven by `--prune`, not by a direct command-line arg. */
  pruned?: boolean;
  /** True if the state entry still survives after this call (partial --target removal). */
  partial?: boolean;
}

/**
 * Remove one named skill. If `targetFilter` is null, removes from every
 * target the skill is on (full uninstall). If non-null, removes only
 * from the named targets; the state entry survives with a reduced
 * `targets` list if any remain.
 */
export function removeOne(
  state: StateFile,
  name: string,
  ctx: CommandContext,
  pruned: boolean,
  targetFilter: readonly string[] | null,
): { updatedState: StateFile; rec: UninstallRecord } {
  const entries = state.installations.filter((e) => e.name === name);
  const rec: UninstallRecord = {
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
      nextState = reduceEntryTargets(nextState, name, entry.scope, remainingTargets);
      anySurvives = true;
    } else {
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
  rec: UninstallRecord,
) {
  // For project-scope entries, the authoritative install location is
  // the entry's recorded `project_root` — NOT `ctx.cwd`.
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
