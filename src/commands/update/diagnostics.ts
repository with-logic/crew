/** Error-only human diagnostics for hard-failed quiet update previews and runs (§5.2, §10.1). */

import { displayText } from "../../refs/display-url.ts";
import { sanitizeLine } from "../../util/redact.ts";
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
      lines.push(failureLine(subject, outcome.error.code, outcome.error.message));
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
      lines.push(failureLine(`${row.name} (from ${row.tap})`, row.error.code, row.error.message));
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

function failureLine(subject: string, code: string, message: string): string {
  return sanitizeLine(displayText(`${subject}: failed (${code}): ${message}`));
}
