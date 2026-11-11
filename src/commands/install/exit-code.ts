/**
 * The exit code of an install, from what each skill did (§9 step 9, §15).
 */

import type { InstallFlowResult } from "../../install/flow.ts";

/** How an install run ended. */
export interface InstallOutcome {
  readonly exitCode: number;
  /** True when no skill failed: every one attempted succeeded, or there was nothing to do. */
  readonly everythingLanded: boolean;
}

/**
 * A skill succeeded if it validated and at least one agent install
 * succeeded. Validation failures are in `result.skipped`; agent-level
 * failures are the records with `anySuccess === false`.
 */
export function installOutcome(result: InstallFlowResult): InstallOutcome {
  const { records } = result.summary;
  const succeeded = records.filter((record) => record.anySuccess).length;
  const operationalFailures = records.length - succeeded;
  const validationFailures = result.skipped.length;
  if (operationalFailures + validationFailures === 0) {
    return { exitCode: 0, everythingLanded: true };
  }
  const allAlreadyInstalled = result.alreadyInstalled.length > 0 && records.length === 0;
  // Partial success.
  if (succeeded > 0 || allAlreadyInstalled) return { exitCode: 1, everythingLanded: false };
  // Nothing succeeded: an invalid skill is exit 4, purely operational failures exit 1.
  return { exitCode: validationFailures > 0 ? 4 : 1, everythingLanded: false };
}
