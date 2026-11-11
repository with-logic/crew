/**
 * Removing skills a project manifest no longer accounts for (§9.2).
 *
 * A manifest-owned skill that has left the manifest's resolved install set
 * is uninstalled. Three kinds are kept, still owned, so a later run can
 * finish the job once the reason is gone:
 *
 *   - a skill something staying at that location still depends on
 *     (`./order.ts`);
 *   - a skill whose removal aborts on an uninstall safety check (§7.4);
 *   - a skill whose install directories are not verifiably the project's
 *     own (`./install-site.ts`).
 *
 * This module reads and returns state; it neither takes the state lock nor
 * writes `state.json`. Both are the caller's job.
 */

import { entryTargetBases } from "../../../../agents/target-lock/bases.ts";
import { withTargetLocks } from "../../../../agents/target-lock/index.ts";
import type { StateEntry, StateFile } from "../../../../core/types.ts";
import { isManifestOwned } from "../../../../manifest/index.ts";
import type { CommandContext } from "../../../types.ts";
import { removeOne, type UninstallRecord } from "../../../uninstall/core.ts";
import { areProjectInstallPathsSafeToRemove, type ProjectStateEntry } from "./install-site.ts";
import { removalOrder } from "./order.ts";
import { type Preflight, preflight, type Uninstall } from "./preflight.ts";

/** State after processing, and what happened to each dropped entry it did not silently keep. */
export interface RemovalOutcome {
  readonly state: StateFile;
  /** One removal record per entry attempted: completed, previewed, or aborted. */
  readonly records: readonly UninstallRecord[];
  /**
   * Names kept because their install directories are not verifiably the
   * project's own. Entries kept because an uninstall safety check aborted
   * are not here: each of those has a record in `records` with its failure.
   */
  readonly keptForUnverifiedInstallSites: readonly string[];
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
   *
   * It must not throw: a manifest that can no longer be read or parsed is
   * not current, and the answer is false. An exception here would escape
   * the sweep and lose the state of the removals already done.
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
  const isDropped = (entry: StateEntry): entry is ProjectStateEntry => {
    const isHere = isManifestOwned(entry) && entry.project_root === projectRoot;
    return isHere && !resolvedSkillNames.has(entry.name);
  };
  const dropped = state.installations.filter(isDropped);
  const run = (unavailableBases?: ReadonlySet<string>): RemovalOutcome | null => {
    if (!isStillCurrent()) return null;
    const previewContext: CommandContext = { ...ctx, flags: { ...ctx.flags, dryRun: true } };
    const uninstall: Uninstall = (from, entry, preview) => {
      const subject = { raw: entry.name, name: entry.name, entries: [entry] };
      const isPruned = false;
      const everyAgent: readonly string[] | null = null;
      const deferStateEntryDrops = false;
      return removeOne(
        from,
        subject,
        preview ? previewContext : ctx,
        isPruned,
        everyAgent,
        deferStateEntryDrops,
        unavailableBases,
      );
    };
    return removeInOrder(state, dropped, preflight(state, dropped, uninstall), {
      uninstall,
      isStillCurrent,
    });
  };
  if (ctx.flags.dryRun) return run();
  // Preparing a target lock writes into the skills directory it guards, so
  // locks are taken only for entries whose directories pass the install-site
  // rule. The rest are not going to be removed, and need no lock.
  const lockable = dropped.filter(areProjectInstallPathsSafeToRemove);
  return withTargetLocks(entryTargetBases(lockable, projectRoot, false), (_failures, unavailable) =>
    run(unavailable),
  );
}

/**
 * Remove what the pre-checks left removable, in the order `removalOrder`
 * gives: it keeps whatever a staying entry requires. Everything is decided
 * before this starts, so no skill is taken away on the strength of a
 * removal that turns out not to happen.
 *
 * On a normal run the caller holds the target locks throughout; a dry run
 * previews without them.
 */
function removeInOrder(
  initial: StateFile,
  dropped: readonly ProjectStateEntry[],
  decided: Preflight,
  steps: { readonly uninstall: Uninstall; readonly isStillCurrent: () => boolean },
): RemovalOutcome {
  const records = [...decided.aborted];
  const keptForUnverifiedInstallSites = [...decided.keptForUnverifiedInstallSites];
  let state = initial;
  const byName = new Map(dropped.map((entry) => [entry.name, entry]));
  let interrupted = false;
  for (const name of removalOrder(dropped, decided.staying)) {
    const entry = byName.get(name) as ProjectStateEntry;
    // `.crewrc` is not covered by any lock, so it is confirmed before every
    // delete, not only the first: an edit mid-sweep stops the sweep there.
    if (!steps.isStillCurrent()) {
      interrupted = true;
      break;
    }
    // Looked at again right before the delete, to keep the gap between
    // checking a directory and removing it as short as it can be. The sweep
    // stops here: what comes later in the order may be a dependency of this
    // entry, which is now staying.
    if (!areProjectInstallPathsSafeToRemove(entry)) {
      keptForUnverifiedInstallSites.push(entry.name);
      break;
    }
    // On a dry run this is a preview too: the context it runs under says so.
    const removal = steps.uninstall(state, entry, false);
    state = removal.updatedState;
    records.push(removal.rec);
    // The pre-check passed (and on a normal run the target locks are held),
    // so a failure is not expected, and it leaves the entry in state. Stop
    // rather than remove something the survivor may still need.
    if (removal.rec.failures.length > 0) break;
  }
  return { state, records, keptForUnverifiedInstallSites, interrupted };
}
