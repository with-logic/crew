/**
 * Which findings `crew doctor --repair` can actually fix (§11.2).
 *
 * This is policy, not presentation: the renderer uses it to count what
 * a repair would address, and `./index.ts` uses it to decide which
 * errors stop counting against the exit code once a repair has run.
 * It lives beside `./repair.ts` so the list and the mechanisms that
 * satisfy it change together — when it sat in the renderer, command
 * logic had to import from the presentation layer to ask a question
 * about behaviour.
 */

import type { Finding } from "./checks.ts";

/**
 * Codes `--repair` actually fixes, each mapped to the mechanism that
 * fixes it. This is an allowlist on purpose: a new finding code is
 * NOT repairable until someone adds the repair and lists it here, so
 * the preview can never promise a fix that doesn't exist.
 *
 * Deliberately absent:
 *   - `customized`, `agent_missing`, `config_invalid` — need a human.
 *   - `missing_project_root` — `checks.ts` documents that removing a
 *     vanished project's install isn't doctor's job, so it is a
 *     permanent heads-up rather than pending work.
 */
const REPAIRABLE_CODES: Record<string, string> = {
  state_entry_without_marker: "repairState",
  marker_without_state: "repairState",
  orphan_store_entry: "repairState",
  // Reconciled by `repairAutoupdateDrift` (§11.2 check 7). These two
  // are listed here because this change implements that reconciliation;
  // a branch without it must not claim them.
  autoupdate_not_loaded: "repairAutoupdateDrift",
  autoupdate_unexpectedly_loaded: "repairAutoupdateDrift",
};

/** True when `code` is one `crew doctor --repair` can actually fix. */
export function isRepairableCode(code: string): boolean {
  return code in REPAIRABLE_CODES;
}

/** How many of `findings` a repair would address. */
export function repairableCount(findings: readonly Finding[]): number {
  let n = 0;
  for (const f of findings) {
    if (isRepairableCode(f.code)) n++;
  }
  return n;
}

/** True when at least one finding is repairable. */
export function isRepairable(findings: readonly Finding[]): boolean {
  return repairableCount(findings) > 0;
}
