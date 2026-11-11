/**
 * Reporting what bringing a project in line with its manifest did (§9.2):
 * the removals, the skills kept, and a manifest that changed mid-run.
 */

import type { CrewErrorName } from "../../../core/errors.ts";
import { safePath, sanitizeLine } from "../../../util/redact.ts";
import type { CommandContext } from "../../types.ts";
import { renderDropped } from "../render/dropped.ts";
import type { Reconciliation } from "./reconcile.ts";

/** What a run tells the user about a reconciliation. */
interface ReconciliationReport {
  /** True when a removal aborted, which makes the command exit 1. */
  readonly hasAbortedRemoval: boolean;
  /** Lines to append to the human report. */
  readonly human: readonly string[];
  /** Lines for stderr and for `warnings` in the `--json` result. */
  readonly warnings: readonly string[];
  /**
   * Under `--quiet`, one stderr line per aborted removal, since the human
   * report that would have explained it is suppressed (§5.2). Otherwise empty.
   */
  readonly quietDiagnostics: readonly string[];
}

/** The uninstall safety checks `--force` overrides (§7.4); it does not override filesystem errors (§13). */
const FORCE_OVERRIDES: ReadonlySet<string> = new Set<CrewErrorName>([
  "untracked_directory",
  "inconsistent_marker",
  "not_installed_here",
]);

/**
 * Turn a reconciliation into output: the removal records as human lines, a
 * warning for each skill kept because its install directory could not be
 * verified, a warning when the manifest changed, whether any removal
 * aborted, and under `--quiet` a diagnostic for each one that did. Reads
 * nothing and writes nothing.
 */
export function reportReconciliation(
  reconciled: Reconciliation,
  ctx: CommandContext,
): ReconciliationReport {
  const warnings = reconciled.keptForUnverifiedInstallSites.map(
    (name) =>
      `warning: kept \`${safePath(name)}\`, which .crewrc no longer requires: crew could not verify that its install directory is this project's own. Remove it by hand if you want it gone.`,
  );
  if (reconciled.manifestChanged) {
    warnings.push(
      "warning: .crewrc changed, or could not be read again, while crew was installing, so crew stopped bringing the project in line with it. Check .crewrc and run `crew install` again.",
    );
  }
  const aborted: string[] = [];
  for (const record of reconciled.removed) {
    for (const { agent, error } of record.failures) {
      const hint = FORCE_OVERRIDES.has(error.code) ? " (pass --force to remove it anyway)" : "";
      aborted.push(
        `error: could not remove \`${safePath(record.name)}\` from ${agent} (${error.code}): ${sanitizeLine(error.message)}${hint}`,
      );
    }
  }
  return {
    hasAbortedRemoval: aborted.length > 0,
    human: renderDropped(reconciled.removed, ctx),
    warnings,
    quietDiagnostics: ctx.flags.quiet ? aborted : [],
  };
}
