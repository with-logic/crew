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
import { readState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { type AutoupdateRepair, repairAutoupdateDrift } from "./autoupdate.ts";
import { checkAutoupdateDrift, checkStateMarkerDrift } from "./checks.ts";
import type { Finding } from "./findings/index.ts";
import { buildMarkerIndex } from "./markers/index.ts";
import { repairStateUnderLock } from "./repair.ts";

/** Whether reconstruction ran, along with fresh inventory diagnostics and scheduler outcomes. */
interface RepairOutcome {
  readonly applied: boolean;
  readonly findings: readonly Finding[];
  readonly driftFindings: readonly Finding[];
  readonly repairs: readonly AutoupdateRepair[];
}

interface RepairInput {
  readonly home: string;
  readonly cwd: string;
  readonly retainedProjectRoots: readonly string[];
}

/**
 * Apply every repair §11.2 permits and report what the scheduler step
 * did. Read-only doctor runs never call this — acquiring the lock
 * would create `state.json` on a fresh home (§14).
 */
export function applyRepairs({ home, cwd, retainedProjectRoots }: RepairInput): RepairOutcome {
  return withStateLock(() => {
    // §11.1/§14: a concurrent uninstall may have removed markers after the initial checks.
    const freshState = readState(home);
    const { markers, findings } = buildMarkerIndex(
      freshState.installations,
      cwd,
      retainedProjectRoots,
    );
    if (findings.length > 0) return { applied: false, findings, driftFindings: [], repairs: [] };
    const driftFindings = checkStateMarkerDrift(freshState.installations, markers);
    repairStateUnderLock(markers, freshState, home);
    const fresh = readConfig(home);
    return {
      applied: true,
      findings,
      driftFindings,
      repairs: repairAutoupdateDrift(checkAutoupdateDrift(fresh), fresh, home),
    };
  }, home);
}
