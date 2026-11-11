/**
 * Removing skills a project manifest no longer accounts for (§9.2).
 *
 * A manifest-owned skill that has left the manifest's resolved install set
 * is uninstalled by the next bare `crew install`. Three kinds are kept,
 * still owned, so a later run can finish the job once the reason is gone:
 *
 *   - a skill something staying at that location still depends on;
 *   - a skill whose removal aborts on an uninstall safety check (§7.4);
 *   - a skill whose install directory is reached through a symbolic link,
 *     and so may be somebody else's directory (`./install-site.ts`).
 */

import { entryTargetBases } from "../../../../agents/target-lock/bases.ts";
import { withTargetLocks } from "../../../../agents/target-lock/index.ts";
import type { StateEntry, StateFile } from "../../../../core/types.ts";
import { isManifestOwned } from "../../../../manifest/index.ts";
import type { CommandContext } from "../../../types.ts";
import { removeOne, type UninstallRecord } from "../../../uninstall/core.ts";
import { hasExpectedProjectInstallPaths, type ProjectEntry } from "./install-site.ts";
import { removalOrder } from "./order.ts";

/** State after processing, and one removal record per entry attempted. */
export interface RemovalOutcome {
  readonly state: StateFile;
  readonly records: readonly UninstallRecord[];
}

/** What to remove, and the conditions it is removed under. */
export interface RemovalRequest {
  readonly ctx: CommandContext;
  readonly projectRoot: string;
  /** Names in the manifest's resolved install set; everything else owned there is dropped. */
  readonly resolvedSkillNames: ReadonlySet<string>;
  /**
   * Whether the manifest this request came from is still the one on disk.
   * Asked before the pre-checks and again just before the first deletion;
   * on a normal run both happen with the target locks held, on a dry run
   * without them.
   */
  readonly isStillCurrent: () => boolean;
}

/**
 * Uninstall the dropped entries at the project root. On a normal run this
 * removes skill directories; on a dry run `removeOne` only previews.
 * Returns null, having changed nothing, when the request is no longer current.
 */
export function processDroppedEntries(
  state: StateFile,
  request: RemovalRequest,
): RemovalOutcome | null {
  const { ctx, projectRoot, resolvedSkillNames, isStillCurrent } = request;
  const isDropped = (entry: StateEntry): entry is ProjectEntry => {
    const isHere = isManifestOwned(entry) && entry.project_root === projectRoot;
    return isHere && !resolvedSkillNames.has(entry.name);
  };
  const dropped = state.installations.filter(isDropped);
  const run = (unavailableBases?: ReadonlySet<string>): RemovalOutcome | null =>
    isStillCurrent() ? removeInOrder(state, dropped, request, unavailableBases) : null;
  if (ctx.flags.dryRun) return run();
  return withTargetLocks(entryTargetBases(dropped, projectRoot, false), (_failures, unavailable) =>
    run(unavailable),
  );
}

/**
 * Decide everything first, then remove.
 *
 * Each dropped entry is pre-checked without touching it: the symlink rule,
 * and the uninstall safety checks by way of a dry run. Those that fail are
 * staying, and `removalOrder` keeps whatever they require. Only then does
 * removal start, so no skill is taken away on the strength of a removal
 * that turns out not to happen.
 */
function removeInOrder(
  initial: StateFile,
  dropped: readonly ProjectEntry[],
  request: RemovalRequest,
  unavailableBases?: ReadonlySet<string>,
): RemovalOutcome | null {
  const { ctx, isStillCurrent } = request;
  const preview: CommandContext = { ...ctx, flags: { ...ctx.flags, dryRun: true } };
  const subjectOf = (entry: StateEntry) => ({
    raw: entry.name,
    name: entry.name,
    entries: [entry],
  });
  const records: UninstallRecord[] = [];
  const staying = new Set<string>();
  for (const entry of dropped) {
    if (!hasExpectedProjectInstallPaths(entry)) {
      staying.add(entry.name);
      continue;
    }
    const { rec } = removeOne(
      initial,
      subjectOf(entry),
      preview,
      false,
      null,
      false,
      unavailableBases,
    );
    if (rec.failures.length === 0) continue;
    staying.add(entry.name);
    records.push(rec);
  }
  // The pre-checks took time too. This is the last point before anything
  // is deleted, so the manifest is confirmed once more.
  if (!isStillCurrent()) return null;
  let state = initial;
  const byName = new Map(dropped.map((entry) => [entry.name, entry]));
  for (const name of removalOrder(dropped, staying)) {
    const subject = subjectOf(byName.get(name) as ProjectEntry);
    const removal = removeOne(state, subject, ctx, false, null, false, unavailableBases);
    state = removal.updatedState;
    records.push(removal.rec);
    // The pre-check passed and the locks are held, so this is not expected.
    // Stop rather than remove something the survivor may still need.
    if (removal.rec.failures.length > 0) break;
  }
  return { state, records };
}
