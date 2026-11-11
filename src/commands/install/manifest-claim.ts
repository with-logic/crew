/**
 * Claiming ownership after a bare `crew install` (§9.2): every skill the
 * manifest resolved to is recorded as the manifest's.
 */

import { claimForManifest } from "../../manifest/index.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";

/** Record `resolved` as owned by the manifest at `projectRoot`. Writes only on change. */
export function claimManifestOwnership(
  home: string,
  projectRoot: string,
  resolved: ReadonlySet<string>,
): void {
  withStateLock(() => {
    const state = readState(home);
    const claimed = claimForManifest(state, projectRoot, resolved);
    if (claimed !== state) writeState(claimed, home);
  }, home);
}
