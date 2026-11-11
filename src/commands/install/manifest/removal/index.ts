/**
 * Removing skills a project manifest no longer accounts for (§9.2).
 *
 * A manifest-owned skill that has left the manifest's resolved install set
 * is uninstalled by the next bare `crew install`. Three cases are kept
 * instead, because removing them would damage something the manifest does
 * not own:
 *
 *   - a skill another installed skill at that location still depends on;
 *   - a skill whose project install directory is physically another
 *     install's — the user-scope one, or another project's (a symlinked
 *     skills directory);
 *   - a skill whose removal aborts on an uninstall safety check (§7.4).
 *
 * A kept skill is released — it loses the `manifest_owned` flag and stays
 * — when it is staying for good: needed by a skill the manifest does not
 * own, or sharing its directory. One whose removal aborted, or that is held
 * back only by such a dependent, stays owned so the next run tries again.
 */

import { entryTargetBases } from "../../../../agents/target-lock/bases.ts";
import { withTargetLocks } from "../../../../agents/target-lock/index.ts";
import type { StateEntry, StateFile } from "../../../../core/types.ts";
import type { CommandContext } from "../../../types.ts";
import { removeOne, type UninstallRecord } from "../../../uninstall/core.ts";
import { planRemovalOrder } from "./order.ts";
import { release } from "./retained.ts";
import { type ProjectEntry, sharesPhysicalTarget } from "./shared-target.ts";

/** State after processing, and one removal record per entry attempted. */
export interface RemovalOutcome {
  readonly state: StateFile;
  readonly records: readonly UninstallRecord[];
}

/**
 * Find the dropped entries and uninstall them. On a normal run this
 * removes skill directories; on a dry run `removeOne` only previews.
 */
export function processDroppedEntries(
  state: StateFile,
  ctx: CommandContext,
  projectRoot: string,
  resolvedSkillNames: ReadonlySet<string>,
): RemovalOutcome {
  const isDropped = (entry: StateEntry): entry is ProjectEntry => {
    const isHere = entry.scope === "project" && entry.project_root === projectRoot;
    const isOwned = entry.manifest_owned === true;
    const isStillResolved = resolvedSkillNames.has(entry.name);
    return isHere && isOwned && !isStillResolved;
  };
  const dropped = state.installations.filter(isDropped);
  if (dropped.length === 0) return { state, records: [] };
  const run = (unavailable?: ReadonlySet<string>) =>
    removeInOrder(state, dropped, ctx, unavailable);
  if (ctx.flags.dryRun) return run();
  return withTargetLocks(entryTargetBases(dropped, projectRoot, false), (_failures, unavailable) =>
    run(unavailable),
  );
}

/**
 * Remove the dropped entries nothing surviving needs, dependents before
 * what they depend on, and release the kept ones that are staying for good.
 */
function removeInOrder(
  initial: StateFile,
  dropped: readonly ProjectEntry[],
  ctx: CommandContext,
  unavailableBases?: ReadonlySet<string>,
): RemovalOutcome {
  let state = initial;
  const records: UninstallRecord[] = [];
  const shared = dropped.filter((entry) => sharesPhysicalTarget(entry, initial));
  const removable = dropped.filter((entry) => !shared.includes(entry));
  const byName = new Map(removable.map((entry) => [entry.name, entry]));
  const order = planRemovalOrder(removable);
  const abortedNames = new Set<string>();
  for (let name = order.next(); name !== undefined; name = order.next()) {
    const entry = byName.get(name) as ProjectEntry;
    const subject = { raw: name, name, entries: [entry] };
    const removal = removeOne(state, subject, ctx, false, null, false, unavailableBases);
    state = removal.updatedState;
    records.push(removal.rec);
    if (removal.rec.failures.length === 0) {
      order.removed(name);
    } else {
      order.aborted(name);
      abortedNames.add(name);
    }
  }
  return { state: release(state, removable, shared, order.needed(), abortedNames), records };
}
