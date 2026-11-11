/**
 * Bringing a project in line with its manifest after a bare `crew install`
 * (§9.2, §9.3): remove what the manifest no longer accounts for, record the
 * lockfile, then claim what the manifest resolved to.
 *
 * All of it happens under one hold of the state lock, and only while the
 * manifest on disk is still the one this run installed from. Two overlapping
 * installs that read different versions of `.crewrc` would otherwise each
 * sweep away what the other had just claimed.
 */

import type { ResolvedSkill } from "../../../core/types.ts";
import { garbageCollectAutoTaps } from "../../../maintenance/auto-taps.ts";
import { claimForManifest, type Manifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import type { CommandContext } from "../../types.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { hasChangedOnDisk } from "./freshness.ts";
import { recordLock } from "./lockfile.ts";
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

/** Nothing removed, kept, or found changed: also the result of a run that did not reconcile at all. */
export const EMPTY_RECONCILIATION: Reconciliation = {
  removed: [],
  keptForUnverifiedInstallSites: [],
  manifestChanged: false,
};
const MANIFEST_CHANGED: Reconciliation = { ...EMPTY_RECONCILIATION, manifestChanged: true };

/**
 * Bring the project at the manifest's root in line with `resolved`, the
 * skills the manifest resolved to. Call only when all of them have landed.
 *
 * In order: uninstall what the manifest owns that is no longer among them,
 * record the lockfile, and mark them as owned. Each step runs only while
 * `.crewrc` is still the manifest this run read. Claims come last so that a
 * run which finds the manifest changed, at any earlier step, has claimed
 * nothing. A dry run previews the removals and writes nothing.
 */
export function reconcileManifestInstalls(
  ctx: CommandContext,
  manifest: Manifest,
  resolved: readonly ResolvedSkill[],
): Reconciliation {
  const resolvedSkillNames = new Set(resolved.map((skill) => skill.name));
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
    // already done and none of this run's claims.
    const before = readState(ctx.home);
    const outcome = processDroppedEntries(before, request);
    if (outcome === null) return MANIFEST_CHANGED;
    // `recordLock` returns false, having written nothing, when it finds the
    // manifest changed. It runs before the claims so that they are never
    // recorded by a run that went on to detect a change.
    const isConfirmed =
      !outcome.interrupted && request.isStillCurrent() && recordLock(manifest, resolved);
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
