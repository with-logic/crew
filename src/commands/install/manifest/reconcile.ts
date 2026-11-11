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
  /** True when `.crewrc` changed during the run, so nothing was claimed or removed. */
  readonly manifestChanged: boolean;
}

/** The result of a run that had nothing to reconcile. */
export const NOTHING_RECONCILED: Reconciliation = { removed: [], manifestChanged: false };

/**
 * Bring ownership at the manifest's project root in line with
 * `resolvedSkillNames`, its resolved install set. A dry run previews the
 * removals and writes nothing.
 */
export function reconcileOwnership(
  ctx: CommandContext,
  manifest: Manifest,
  resolvedSkillNames: ReadonlySet<string>,
): Reconciliation {
  const root = manifest.projectRoot;
  if (ctx.flags.dryRun) {
    const preview = processDroppedEntries(readState(ctx.home), ctx, root, resolvedSkillNames);
    return { removed: preview.records, manifestChanged: false };
  }
  return withStateLock(() => {
    if (hasChangedOnDisk(manifest)) return { removed: [], manifestChanged: true };
    const before = readState(ctx.home);
    const claimed = claimForManifest(before, root, resolvedSkillNames);
    const { state, records } = processDroppedEntries(claimed, ctx, root, resolvedSkillNames);
    if (state !== before) writeState(state, ctx.home);
    // A dropped line may have been the last use of its auto tap (§16.5).
    if (records.length > 0) garbageCollectAutoTaps(state, ctx.home);
    return { removed: records, manifestChanged: false };
  }, ctx.home);
}

/** True unless the manifest governing the project still lists exactly the same references. */
function hasChangedOnDisk(snapshot: Manifest): boolean {
  const refs = (manifest: Manifest | null): string =>
    JSON.stringify([manifest?.file, manifest?.entries.map((entry) => entry.ref)]);
  try {
    return refs(loadManifestFor(snapshot.projectRoot)) !== refs(snapshot);
  } catch {
    return true; // Unreadable or invalid now: not the manifest this run installed from.
  }
}

/** The stderr lines a run owes the user when `.crewrc` changed underneath it. */
export function staleManifestWarnings(reconciled: Reconciliation): string[] {
  if (!reconciled.manifestChanged) return [];
  return [
    "warning: .crewrc changed while crew was installing, so nothing was claimed or removed. Run `crew install` again.",
  ];
}
