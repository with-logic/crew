/**
 * Reconciling ownership after a bare `crew install` (§9.2): claim what the
 * manifest resolved to, then remove what it no longer accounts for.
 *
 * Both happen under one hold of the state lock, and only if the manifest on
 * disk is still the one this run installed from. Two overlapping installs
 * that read different versions of `.crewrc` would otherwise each sweep away
 * what the other had just claimed.
 */

import { garbageCollectAutoTaps } from "../../../maintenance/auto-taps.ts";
import { claimForManifest, loadManifestFor, type Manifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import type { CommandContext } from "../../types.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { processDroppedEntries } from "./removal/index.ts";

/** What reconciling did. */
export interface Reconciliation {
  /** One removal record per dropped entry attempted: completed, previewed, or aborted. */
  readonly removed: readonly UninstallRecord[];
  /** True when `.crewrc` changed, or could not be re-read, during the run: nothing was claimed or removed. */
  readonly manifestChanged: boolean;
}

/** The result when ownership matches the manifest and nothing had to be removed. */
export const IN_STEP_WITH_MANIFEST: Reconciliation = { removed: [], manifestChanged: false };
const MANIFEST_CHANGED: Reconciliation = { removed: [], manifestChanged: true };

/**
 * Bring ownership at the manifest's project root in line with
 * `resolvedSkillNames`, its resolved install set: claim what is in it, then
 * remove what the manifest owns that is not. A dry run previews the
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
    // Asked again once target locks are held: waiting for them takes time.
    isStillCurrent: () => !hasChangedOnDisk(manifest),
  };
  if (ctx.flags.dryRun) {
    const preview = processDroppedEntries(readState(ctx.home), request);
    return preview ? { removed: preview.records, manifestChanged: false } : MANIFEST_CHANGED;
  }
  return withStateLock(() => {
    const before = readState(ctx.home);
    const claimed = claimForManifest(before, manifest.projectRoot, resolvedSkillNames);
    const outcome = processDroppedEntries(claimed, request);
    if (outcome === null) return MANIFEST_CHANGED;
    if (outcome.state !== before) writeState(outcome.state, ctx.home);
    // A dropped line may have been the last use of its auto tap (§16.5).
    if (outcome.records.length > 0) garbageCollectAutoTaps(outcome.state, ctx.home);
    return { removed: outcome.records, manifestChanged: false };
  }, ctx.home);
}

/** True unless the manifest governing the project still lists exactly the same references. */
function hasChangedOnDisk(snapshot: Manifest): boolean {
  const identity = (manifest: Manifest | null): string =>
    JSON.stringify([manifest?.file, manifest?.entries.map((entry) => entry.ref)]);
  try {
    return identity(loadManifestFor(snapshot.projectRoot)) !== identity(snapshot);
  } catch {
    return true; // Unreadable or invalid now: not the manifest this run installed from.
  }
}

/** The warnings a run owes the user when `.crewrc` changed underneath it. */
export function staleManifestWarnings(reconciled: Reconciliation): string[] {
  if (!reconciled.manifestChanged) return [];
  return [
    "warning: .crewrc changed, or could not be read again, while crew was installing, so nothing was claimed or removed. Check .crewrc and run `crew install` again.",
  ];
}
