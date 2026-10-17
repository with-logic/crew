/**
 * `crew install`'s exit code (§9 step 9, §15).
 *
 * A skill succeeded iff it validated AND at least one agent install
 * succeeded. Skipped candidates are validation failures unless crew
 * couldn't read them (operational, like failed agent installs).
 */

import type { InstallFlowResult } from "../../install/flow.ts";

/**
 * 0 when nothing failed; 4 when nothing succeeded and at least one skill
 * was invalid; 1 for any other failure (partial, or only operational).
 */
export function installExitCode(result: InstallFlowResult): number {
  const succeeded = result.summary.records.filter((r) => r.anySuccess).length;
  const validationFailures = result.skipped.filter((s) => s.code === "invalid_skill").length;
  const operationalFailures =
    result.summary.records.filter((r) => !r.anySuccess).length +
    (result.skipped.length - validationFailures);
  const failed = operationalFailures + validationFailures;
  const allAlreadyInstalled =
    result.alreadyInstalled.length > 0 && result.summary.records.length === 0;
  if (failed === 0) return 0; // Every attempted skill succeeded, or nothing to do.
  if (succeeded > 0 || allAlreadyInstalled) return 1; // Partial success.
  if (validationFailures > 0) return 4; // Zero succeeded; at least one invalid skill.
  return 1; // Zero succeeded; purely operational failures.
}
