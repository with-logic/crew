/** Safe display fields and error projections for update diagnostics (§5.2, §10.1, §13). */

import { displayText } from "../../refs/display-url.ts";
import { withRemedy } from "../../util/error-remedy.ts";
import { sanitizeLine } from "../../util/redact.ts";
import { projectTag } from "./location.ts";
import type { UpdatePlan } from "./plan.ts";

/** The caller owns the quiet/hard-failure gate; rendering never changes severity or raw rows. */
export function renderQuietUpdateErrors(
  plan: Pick<UpdatePlan, "rows" | "tapReexpandRows" | "tapRows" | "selectors">,
): string[] {
  const lines: string[] = [];
  for (const row of plan.rows) {
    const subject =
      row.scope === "project" && row.project_root
        ? `${row.name} (in ${row.project_root})`
        : row.name;
    const outcome = row.outcome;
    if (outcome.kind === "failed") {
      lines.push(
        failureLine(subject, outcome.error.code, outcome.error.message, outcome.error.remedy),
      );
    } else if (outcome.kind === "updated") {
      for (const target of outcome.per_target) {
        if (target.kind === "failed")
          lines.push(
            failureLine(`${subject}: ${target.agent}`, target.error.code, target.error.message),
          );
      }
    }
  }
  for (const row of plan.tapReexpandRows) {
    if (row.kind === "tap_error")
      lines.push(
        failureLine(
          `${row.name}${projectTag(row)} (from ${row.tap})`,
          row.error.code,
          row.error.message,
          row.error.remedy,
        ),
      );
  }
  const namedTaps = new Set<string>();
  for (const selector of plan.selectors) {
    if (selector.kind === "tap") namedTaps.add(selector.name);
  }
  for (const row of plan.tapRows) {
    if (row.kind === "failed" && namedTaps.has(row.name))
      lines.push(failureLine(`tap ${row.name}`, row.error.code, row.error.message));
  }
  return lines;
}

/** Escape each source-derived display field before trusted layout or styling (§5.2, §13). */
export function displayField(value: string): string {
  return sanitizeLine(displayText(value));
}

/** Only diagnostic messages change; machine identity fields remain raw (§10.1.1, §13). */
export function displayUpdateErrors(
  input: Pick<UpdatePlan, "rows" | "tapReexpandRows">,
): Pick<UpdatePlan, "rows" | "tapReexpandRows"> {
  return {
    rows: input.rows.map((row) => {
      const outcome = row.outcome;
      if (outcome.kind !== "failed") return row;
      return {
        ...row,
        outcome: {
          ...outcome,
          error: { ...outcome.error, message: displayField(outcome.error.message) },
        },
      };
    }),
    tapReexpandRows: input.tapReexpandRows.map((row) =>
      row.kind === "tap_error"
        ? { ...row, error: { ...row.error, message: displayField(row.error.message) } }
        : row,
    ),
  };
}

function failureLine(subject: string, code: string, message: string, remedy?: string): string {
  return sanitizeLine(withRemedy(`${subject}: failed (${code}): ${message}`, { remedy }));
}
