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
 * its dependencies are still required.
 *
 * Per-skill removal and state mutation live in sibling modules
 * (`./core.ts`, `./state.ts`).
 */

import { CrewError } from "../../core/errors.ts";
import type { StateFile } from "../../core/types.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { ALL_ADAPTERS, adapterByName } from "../../targets/registry.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { removeOne, type UninstallRecord } from "./core.ts";
import { findOrphan } from "./state.ts";

export function uninstallCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall` needs at least one skill name — run `crew list` to see what's installed",
    );
  }
  const prune = Boolean(ctx.flags.extras["prune"]);
  const targetFilter = validateTargetFilter(ctx.flags.target);

  const records: UninstallRecord[] = [];
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
 * Recursively remove any skill that is now an autoremovable orphan:
 * `explicit: false` AND empty `required_by`. Runs until a full pass
 * finds no new orphans. Prune never respects `--target` filters —
 * when we auto-remove a dep, we remove it fully.
 */
function pruneOrphans(
  state: StateFile,
  ctx: CommandContext,
  records: UninstallRecord[],
): StateFile {
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
