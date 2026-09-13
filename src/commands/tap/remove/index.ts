/**
 * `crew tap remove <name>` (§16.3), including the attached-skill guard.
 *
 * Removing a tap that still backs state entries would leave those
 * entries pointing at a tap that no longer exists, so the bare command
 * refuses and names the two ways forward:
 *
 *   - `--uninstall` removes the attached skills (via the §7.4 uninstall
 *     algorithm) and then the tap;
 *   - `--force` drops the tap and keeps the skills, which then report
 *     `tap_missing` on `crew update` (§10.1).
 *
 * The default-tap guard (§16.2) is evaluated first, so `core` still
 * needs `--force` regardless of what's attached.
 *
 * A non-dry run does every read, guard, and mutation inside ONE
 * lock-held operation: an install landing between a preflight read and
 * the tap deletion would otherwise leave dangling state. The dry-run
 * path stays lock-free, matching every other preview in the CLI.
 *
 * Guard evaluation lives in `./plan.ts`.
 */

import { readConfig, writeConfig } from "../../../config/load.ts";
import { CrewError } from "../../../core/errors.ts";
import { tapPath } from "../../../core/paths.ts";
import type { StateEntry, TapConfig } from "../../../core/types.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import { rmrf } from "../../../util/fs.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { removeOne, type UninstallRecord } from "../../uninstall/core.ts";
import { dropEntriesAndUpdateRequiredBy } from "../../uninstall/state.ts";
import { describe, planRemove, type RemovePlan } from "./plan.ts";
import { renderTapRemove } from "./render.ts";

export { attachedEntries, tapToRemove } from "./plan.ts";

/** Entry point for `crew tap remove` / `crew untap`. */
export function tapRemove(ctx: CommandContext, args: readonly string[]): CommandOutput {
  if (ctx.flags.extras["recursive"])
    throw new CrewError("usage_error", "`--recursive` only applies to `crew tap add`");
  if (args.length !== 1)
    throw new CrewError(
      "usage_error",
      "`crew tap remove` needs exactly one tap name — see `crew tap list`",
    );
  const name = args[0]!;
  const uninstall = Boolean(ctx.flags.extras["uninstall"]);
  const plan = () =>
    planRemove({
      taps: readConfig(ctx.home).taps,
      state: readState(ctx.home),
      name,
      force: ctx.flags.force,
      uninstall,
    });

  // A preview reads without the lock; a real run does everything under it
  // so no install can land between the guard and the deletion.
  if (ctx.flags.dryRun) return runPlan(ctx, plan(), true);
  return withStateLock(() => runPlan(ctx, plan(), false), ctx.home);
}

/** Execute a plan. The caller decides whether the state lock is held. */
function runPlan(ctx: CommandContext, plan: RemovePlan, dryRun: boolean): CommandOutput {
  if (plan.uninstall) return removeWithSkills(ctx, plan, dryRun);
  return removeTapOnly(ctx, plan.tap, ctx.flags.force ? plan.attached : [], dryRun);
}

/** Drop the tap row and its clone. Caller holds the state lock. */
function dropTap(home: string, tap: TapConfig): void {
  const config = readConfig(home);
  writeConfig({ ...config, taps: config.taps.filter((t) => t.name !== tap.name) }, home);
  // Path taps don't own their directory; never delete it.
  if (tap.kind === "git") rmrf(tapPath(tap.name, home));
}

/** `--force` (or nothing attached): remove the tap, keep any installs. */
function removeTapOnly(
  ctx: CommandContext,
  tap: TapConfig,
  kept: readonly StateEntry[],
  dryRun: boolean,
): CommandOutput {
  if (!dryRun) dropTap(ctx.home, tap);
  const keptLabels = describe(kept);
  return {
    exitCode: 0,
    human: renderTapRemove({
      name: tap.name,
      kind: tap.kind,
      dryRun,
      tapRemoved: true,
      kept: keptLabels,
      style: ctx.style,
    }),
    json: {
      name: tap.name,
      ...(keptLabels.length > 0 ? { kept: keptLabels } : {}),
      ...(dryRun ? { dry_run: true } : {}),
    },
  };
}

/** `--uninstall`: run the §7.4 removal for each attached entry, then drop the tap. */
function removeWithSkills(ctx: CommandContext, plan: RemovePlan, dryRun: boolean): CommandOutput {
  const records: UninstallRecord[] = [];
  let state = readState(ctx.home);
  // Group this tap's entries by skill name so each name is removed once,
  // in a single state pass, and only entries belonging to THIS tap are
  // touched — a same-named skill from another tap or project stays put.
  const byName = new Map<string, StateEntry[]>();
  for (const e of plan.attached) {
    const list = byName.get(e.name);
    if (list) list.push(e);
    else byName.set(e.name, [e]);
  }
  // Each `removeOne` rebuilds the whole installations array, so K skills
  // over N entries costs K*N visits. Run the per-agent filesystem work
  // per skill (it must stay per-skill), collect the entries that came off
  // cleanly, and apply the state change in one keyed traversal.
  //
  // Cleanliness is per ENTRY, not per name: one skill name can be
  // installed at several §11.1 locations (user + project, or two project
  // roots). Keying the decision on the name group would retain a deleted
  // install's row whenever a sibling location aborted, leaving state
  // claiming bytes that are gone and blocking the tap forever.
  const cleanlyRemoved: StateEntry[] = [];
  for (const [name, entries] of byName) {
    const { rec, outcomes } = removeOne(state, { raw: name, name, entries }, ctx, false, null);
    records.push(rec);
    for (const o of outcomes) {
      if (o.fullyRemoved) cleanlyRemoved.push(o.entry);
    }
  }
  state = dropEntriesAndUpdateRequiredBy(state, cleanlyRemoved);

  const failed = records.some((r) => r.failures.length > 0);
  if (!dryRun) {
    writeState(state, ctx.home);
    // Only drop the tap once every skill actually came off; a safety
    // abort leaves the tap in place so the user can retry with --force.
    if (!failed) dropTap(ctx.home, plan.tap);
  }
  return {
    exitCode: failed ? 1 : 0,
    human: renderTapRemove({
      name: plan.tap.name,
      kind: plan.tap.kind,
      dryRun,
      tapRemoved: !failed,
      kept: [],
      uninstalled: records,
      style: ctx.style,
    }),
    json: { name: plan.tap.name, uninstalled: records, ...(dryRun ? { dry_run: true } : {}) },
  };
}
