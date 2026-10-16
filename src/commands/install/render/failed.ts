/**
 * The "Failed (N)" block of `crew install`'s human output (§9 step 9):
 * each skipped candidate's reason, and its next step when it has one.
 * Remedies are human-only (§13), so `--json` never carries them.
 */

import type { SkippedSkill } from "../../../sources/expand.ts";
import { wrap } from "../../../util/format.ts";
import type { Styler } from "../../../util/term.ts";

/** The "Failed (N)" block for skipped candidates; empty when nothing failed. */
export function failedLines(
  input: { readonly skipped: readonly SkippedSkill[]; readonly width: number },
  style: Styler,
): string[] {
  if (input.skipped.length === 0) return [];
  const width = Math.max(40, input.width - 4);
  const lines = ["", style.bold(`Failed (${input.skipped.length}):`)];
  for (const s of input.skipped) {
    // `wrap` always returns at least one element for a non-empty
    // message — `s.message` is a CrewError message, never empty.
    const wrapped = wrap(s.message, width);
    lines.push(`  ${style.symbol("fail")} ${style.red(wrapped[0]!)}`);
    for (let i = 1; i < wrapped.length; i++) lines.push(`    ${style.red(wrapped[i]!)}`);
    for (const line of s.remedy === undefined ? [] : wrap(s.remedy, width)) {
      lines.push(`    ${style.dim(line)}`);
    }
  }
  return lines;
}
