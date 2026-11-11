/**
 * The exit code of an install, from what each skill did (§9 step 9, §15).
 */

/** The parts of an install's result (`InstallFlowResult`) that decide how it ended. */
export interface InstallTally {
  readonly summary: { readonly records: readonly { readonly anySuccess: boolean }[] };
  readonly alreadyInstalled: readonly unknown[];
  readonly skipped: readonly unknown[];
}

/**
 * How a `crew install` run ended. The two fields move together: exit 0
 * exactly when no skill failed, which is also what lets a bare install go
 * on to reconcile the project with its manifest.
 */
export type InstallCommandOutcome =
  /** Every skill attempted succeeded, or there was nothing to do. */
  | { readonly exitCode: 0; readonly everythingLanded: true }
  /** 1: partial success, or only operational failures. 4: nothing succeeded and a skill was invalid. */
  | { readonly exitCode: 1 | 4; readonly everythingLanded: false };

/**
 * A skill succeeded if it validated and at least one agent install
 * succeeded. Validation failures are in `result.skipped`; agent-level
 * failures are the records with `anySuccess === false`.
 */
export function installOutcome(result: InstallTally): InstallCommandOutcome {
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
