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
 * Codes `--repair` actually fixes. An allowlist on purpose: a new
 * finding code is NOT repairable until someone adds the repair and
 * lists it here, so the preview can never promise a fix that doesn't
 * exist.
 *
 * A set rather than a code-to-mechanism map: nothing reads the
 * mechanism, and the labels went stale as soon as the rebuild moved out
 * of `repairState`. Which function does the work belongs next to the
 * work, not in a lookup nobody queries.
 *
 * The first three are reconciled by the state rebuild; the two
 * autoupdate codes by `repairAutoupdateDrift` (§11.2 check 7), listed
 * here because this change implements that reconciliation — a branch
 * without it must not claim them.
 *
 * Deliberately absent:
 *   - `customized`, `agent_missing`, `config_invalid` — need a human.
 *   - `missing_project_root` — `checks.ts` documents that removing a
 *     vanished project's install isn't doctor's job, so it is a
 *     permanent heads-up rather than pending work.
 */
const REPAIRABLE_CODES: ReadonlySet<string> = new Set([
  "state_entry_without_marker",
  "marker_without_state",
  "orphan_store_entry",
  "autoupdate_not_loaded",
  "autoupdate_unexpectedly_loaded",
]);

/** True when `code` is one `crew doctor --repair` can actually fix. */
export function isRepairableCode(code: string): boolean {
  return REPAIRABLE_CODES.has(code);
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
