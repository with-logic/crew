/**
 * Claiming ownership after a bare `crew install` (§9.2): every skill the
 * manifest resolved to is recorded as the manifest's.
 */

import { claimForManifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";

/** Record the resolved skills as owned by the manifest at `projectRoot`. Writes only on change. */
export function claimManifestOwnership(claim: {
  readonly home: string;
  readonly projectRoot: string;
  readonly resolvedSkillNames: ReadonlySet<string>;
}): void {
  withStateLock(() => {
    const state = readState(claim.home);
    const claimed = claimForManifest(state, claim.projectRoot, claim.resolvedSkillNames);
    if (claimed !== state) writeState(claimed, claim.home);
  }, claim.home);
}
