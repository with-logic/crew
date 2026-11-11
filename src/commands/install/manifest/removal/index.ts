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
import { areProjectInstallPathsSafeToRemove, type ProjectEntry } from "./install-site.ts";
import { removalOrder } from "./order.ts";

/** State after processing, and what happened to each dropped entry it did not silently keep. */
export interface RemovalOutcome {
  readonly state: StateFile;
  /** One removal record per entry attempted: completed, previewed, or aborted. */
  readonly records: readonly UninstallRecord[];
  /** Names kept because their install directories are not provably the project's own. */
  readonly keptAsUnsafe: readonly string[];
  /** True when the sweep stopped early because the manifest stopped being current. */
  readonly interrupted: boolean;
}

/** What to remove, and the conditions it is removed under. */
interface RemovalRequest {
  readonly ctx: CommandContext;
  readonly projectRoot: string;
  /** Names in the manifest's resolved install set; everything else owned there is dropped. */
  readonly resolvedSkillNames: ReadonlySet<string>;
  /**
   * Whether the manifest this request came from is confirmed to still be
   * the one on disk. Asked before the pre-checks and again before every
   * deletion. On a normal run that happens with the target locks held; a
   * dry run previews without locks.
   */
  readonly isStillCurrent: () => boolean;
}

/**
 * Uninstall the dropped entries at the project root. On a normal run this
 * removes skill directories; on a dry run `removeOne` only previews.
 * Returns null, having changed nothing, when the request was already stale
 * before the sweep started. If it goes stale partway through, the outcome
 * is `interrupted` and holds the removals completed up to that point.
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
 * Each dropped entry is pre-checked without touching it: the install-site
 * rule, and the uninstall safety checks by way of a dry run. Those that
 * fail are staying, and `removalOrder` keeps whatever they require. Only
 * then does removal start, so no skill is taken away on the strength of a
 * removal that turns out not to happen.
 *
 * On a normal run the caller holds the target locks throughout; a dry run
 * previews without them.
 */
function removeInOrder(
  initial: StateFile,
  dropped: readonly ProjectEntry[],
  request: RemovalRequest,
  unavailableBases?: ReadonlySet<string>,
): RemovalOutcome {
  const { ctx, isStillCurrent } = request;
  const preview: CommandContext = { ...ctx, flags: { ...ctx.flags, dryRun: true } };
  /** Uninstall `entry` from every agent it is on, fully, updating `state` as it goes. */
  const uninstall = (state: StateFile, entry: StateEntry, uninstallContext: CommandContext) => {
    const subject = { raw: entry.name, name: entry.name, entries: [entry] };
    const options = { pruned: false, agentFilter: null, deferStateEntryDrops: false };
    return removeOne(
      state,
      subject,
      uninstallContext,
      options.pruned,
      options.agentFilter,
      options.deferStateEntryDrops,
      unavailableBases,
    );
  };
  const records: UninstallRecord[] = [];
  const keptAsUnsafe: string[] = [];
  const staying = new Set<string>();
  for (const entry of dropped) {
    if (!areProjectInstallPathsSafeToRemove(entry)) {
      staying.add(entry.name);
      keptAsUnsafe.push(entry.name);
      continue;
    }
    const { rec } = uninstall(initial, entry, preview);
    if (rec.failures.length === 0) continue;
    staying.add(entry.name);
    records.push(rec);
  }
  let state = initial;
  const byName = new Map(dropped.map((entry) => [entry.name, entry]));
  let interrupted = false;
  for (const name of removalOrder(dropped, staying)) {
    const entry = byName.get(name) as ProjectEntry;
    // `.crewrc` is not covered by any lock, so it is confirmed before every
    // delete, not only the first: an edit mid-sweep stops the sweep there.
    if (!isStillCurrent()) {
      interrupted = true;
      break;
    }
    // Looked at again right before the delete, to keep the gap between
    // checking a directory and removing it as short as it can be.
    if (!areProjectInstallPathsSafeToRemove(entry)) {
      keptAsUnsafe.push(entry.name);
      break;
    }
    const removal = uninstall(state, entry, ctx);
    state = removal.updatedState;
    records.push(removal.rec);
    // The pre-check passed (and on a normal run the target locks are held),
    // so this is not expected. Stop rather than remove something the
    // survivor may still need.
    if (removal.rec.failures.length > 0) break;
  }
  return { state, records, keptAsUnsafe, interrupted };
}
