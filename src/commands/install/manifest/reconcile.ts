/**
 * Reconciling ownership after a bare `crew install` (§9.2): record that the
 * manifest owns the skills it resolved to.
 *
 * This happens under the state lock, and only if the manifest on disk is
 * still the one this run installed from. A run that read an older version
 * of `.crewrc` must not act on it: once removal of dropped skills exists,
 * two overlapping installs reading different versions could otherwise each
 * sweep away what the other had just claimed.
 */

import { claimForManifest, loadManifestFor, type Manifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";

/** What reconciling did. */
export interface Reconciliation {
  /** True when `.crewrc` changed during the run, so nothing was claimed. */
  readonly manifestChanged: boolean;
}

/** The result of a run that had nothing to reconcile. */
export const NOTHING_RECONCILED: Reconciliation = { manifestChanged: false };

/**
 * Mark the skills in `resolvedSkillNames`, the manifest's resolved install
 * set, as owned by `manifest`. State is written only when an entry changes.
 */
export function reconcileOwnership(reconcile: {
  readonly home: string;
  readonly manifest: Manifest;
  readonly resolvedSkillNames: ReadonlySet<string>;
}): Reconciliation {
  const { home, manifest, resolvedSkillNames } = reconcile;
  return withStateLock(() => {
    if (hasChangedOnDisk(manifest)) return { manifestChanged: true };
    const state = readState(home);
    const claimed = claimForManifest(state, manifest.projectRoot, resolvedSkillNames);
    if (claimed !== state) writeState(claimed, home);
    return NOTHING_RECONCILED;
  }, home);
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
    "warning: .crewrc changed while crew was installing, so nothing was reconciled. Run `crew install` again.",
  ];
}
