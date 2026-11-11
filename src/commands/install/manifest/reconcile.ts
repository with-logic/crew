/**
 * Reconciling ownership after a bare `crew install` (§9.2): remove what the
 * manifest no longer accounts for, then claim what it resolved to.
 *
 * Both happen under one hold of the state lock, and only while the manifest
 * on disk is still the one this run installed from. Two overlapping installs
 * that read different versions of `.crewrc` would otherwise each sweep away
 * what the other had just claimed.
 */

import { garbageCollectAutoTaps } from "../../../maintenance/auto-taps.ts";
import { claimForManifest, type Manifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import type { CommandContext } from "../../types.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { hasChangedOnDisk } from "./freshness.ts";
import { processDroppedEntries, type RemovalOutcome } from "./removal/index.ts";

/** What reconciling did. */
export interface Reconciliation {
  /** One removal record per dropped entry attempted: completed, previewed, or aborted. */
  readonly removed: readonly UninstallRecord[];
  /** Names kept because their install directories are not verifiably the project's own. */
  readonly keptForUnverifiedInstallSites: readonly string[];
  /**
   * True when `.crewrc` changed, or could not be re-read, during the run.
   * Reconciling stopped at that point: before anything was removed, or
   * partway through the removals, in which case `removed` holds the ones
   * already done. Nothing was claimed, and the lockfile was left as it was.
   */
  readonly manifestChanged: boolean;
}

/** The result of a run that did not reconcile, or that reconciled and had nothing to remove or report. */
export const IN_STEP_WITH_MANIFEST: Reconciliation = {
  removed: [],
  keptForUnverifiedInstallSites: [],
  manifestChanged: false,
};
const MANIFEST_CHANGED: Reconciliation = { ...IN_STEP_WITH_MANIFEST, manifestChanged: true };

/**
 * Bring ownership at the manifest's project root in line with
 * `resolvedSkillNames`, its resolved install set: remove what the manifest
 * owns that is not in it, then claim what is. A dry run previews the
 * removals and writes nothing.
 */
export function reconcileOwnership(
  ctx: CommandContext,
  manifest: Manifest,
  resolvedSkillNames: ReadonlySet<string>,
): Reconciliation {
  const request = {
    ctx,
    projectRoot: manifest.projectRoot,
    resolvedSkillNames,
    isStillCurrent: () => !hasChangedOnDisk(manifest),
  };
  if (ctx.flags.dryRun) {
    const preview = processDroppedEntries(readState(ctx.home), request);
    return preview ? reconciliationOf(preview) : MANIFEST_CHANGED;
  }
  return withStateLock(() => {
    // Removal runs on the unclaimed state, so that if the manifest stops
    // being current partway through, what is written holds the removals
    // already done and none of this run's claims. Claims go on last, and
    // only once the manifest is confirmed a final time.
    const before = readState(ctx.home);
    const outcome = processDroppedEntries(before, request);
    if (outcome === null) return MANIFEST_CHANGED;
    const isConfirmed = !outcome.interrupted && request.isStillCurrent();
    const after = isConfirmed
      ? claimForManifest(outcome.state, manifest.projectRoot, resolvedSkillNames)
      : outcome.state;
    if (after !== before) writeState(after, ctx.home);
    // A dropped line may have been the last use of its auto tap (§16.5).
    if (outcome.state !== before) garbageCollectAutoTaps(after, ctx.home);
    return { ...reconciliationOf(outcome), manifestChanged: !isConfirmed };
  }, ctx.home);
}

function reconciliationOf(outcome: RemovalOutcome): Reconciliation {
  return {
    removed: outcome.records,
    keptForUnverifiedInstallSites: outcome.keptForUnverifiedInstallSites,
    manifestChanged: outcome.interrupted,
  };
}
