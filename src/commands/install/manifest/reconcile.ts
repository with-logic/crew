/**
 * Bringing a project in line with its manifest after a bare `crew install`
 * (§9.2, §9.3): remove what the manifest no longer accounts for, record the
 * lockfile, then claim what the manifest resolved to.
 *
 * On a run that writes, all of it happens under one hold of the state lock,
 * and only while the manifest on disk is still the one this run installed
 * from. Two overlapping installs that read different versions of `.crewrc`
 * would otherwise each sweep away what the other had just claimed.
 *
 * A dry run takes no lock: it previews the removals from the state it reads,
 * and another run may change that state before the preview is acted on.
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
 * confirm one last time that `.crewrc` is still the manifest this run read,
 * then record the lockfile and mark the resolved skills as owned. A run that
 * finds the manifest changed, before or during the removals or at that last
 * confirmation, writes neither the lockfile nor any claim. A change after
 * the last confirmation is not seen by this run; the next bare install
 * reconciles against it. A dry run previews the removals, without the state
 * lock, and writes nothing.
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
    const before = readState(ctx.home);
    const outcome = processDroppedEntries(before, request);
    if (outcome === null) return MANIFEST_CHANGED;
    // The removals are persisted on their own, before the lockfile step,
    // which can fail: state must not go on listing a skill that is gone.
    if (outcome.state !== before) {
      writeState(outcome.state, ctx.home);
      // A dropped line may have been the last use of its auto tap (§16.5).
      garbageCollectAutoTaps(outcome.state, ctx.home);
    }
    if (outcome.interrupted || !request.isStillCurrent()) {
      return { ...reconciliationOf(outcome), manifestChanged: true };
    }
    // That was the last look at `.crewrc`. From here the run only writes:
    // the lockfile, then the claims, both from the manifest just confirmed.
    // Nothing is checked between or after the two, so a run that reports a
    // changed manifest has written neither.
    recordLock(manifest, resolved);
    const claimed = claimForManifest(outcome.state, manifest.projectRoot, resolvedSkillNames);
    if (claimed !== outcome.state) writeState(claimed, ctx.home);
    return reconciliationOf(outcome);
  }, ctx.home);
}

function reconciliationOf(outcome: RemovalOutcome): Reconciliation {
  return {
    removed: outcome.records,
    keptForUnverifiedInstallSites: outcome.keptForUnverifiedInstallSites,
    manifestChanged: outcome.interrupted,
  };
}
