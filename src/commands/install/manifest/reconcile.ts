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

import { claimForManifest, type Manifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import { hasChangedOnDisk } from "./freshness.ts";

/** What reconciling did. */
export interface Reconciliation {
  /**
   * True when `.crewrc` changed, or could not be re-read, during the run, so
   * ownership or the lockfile was left as it was.
   */
  readonly manifestChanged: boolean;
}

/** The result when ownership matches the manifest: reconciled, or nothing to reconcile. */
export const IN_STEP_WITH_MANIFEST: Reconciliation = { manifestChanged: false };

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
    return IN_STEP_WITH_MANIFEST;
  }, home);
}

/** The warnings a run owes the user when `.crewrc` changed underneath it. */
export function staleManifestWarnings(reconciled: Reconciliation): string[] {
  if (!reconciled.manifestChanged) return [];
  return [
    "warning: .crewrc changed, or could not be read again, while crew was installing, so crew stopped bringing the project in line with it. Check .crewrc and run `crew install` again.",
  ];
}
