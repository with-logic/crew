/**
 * Repair coordination for `crew doctor --repair` (§11.2).
 *
 * Owns the state lock for the whole repair and sequences the two steps
 * that run under it: the marker-driven state/config/store rebuild
 * (`./repair.ts`) and the scheduler reconciliation (`./autoupdate.ts`).
 *
 * They share ONE lock deliberately. `crew autoupdate disable` could
 * otherwise persist a new config between the two steps, after which
 * doctor would reload a scheduler the user had just turned off and
 * report success. Config and drift are therefore re-read inside the
 * lock rather than reusing what the checks saw. Taking a second lock
 * for the scheduler step instead would deadlock against the first.
 */

import { readConfig } from "../../config/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { type AutoupdateRepair, repairAutoupdateDrift } from "./autoupdate.ts";
import { checkAutoupdateDrift } from "./checks.ts";
import type { MarkerEntry } from "./markers.ts";
import { repairStateUnderLock } from "./repair.ts";

/**
 * Apply every repair §11.2 permits and report what the scheduler step
 * did. Read-only doctor runs never call this — acquiring the lock
 * would create `state.json` on a fresh home (§14).
 */
export function applyRepairs(markers: readonly MarkerEntry[], home: string): AutoupdateRepair[] {
  return withStateLock(() => {
    repairStateUnderLock(markers, home);
    const fresh = readConfig(home);
    return repairAutoupdateDrift(checkAutoupdateDrift(fresh), fresh, home);
  }, home);
}
