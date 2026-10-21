/** Human status and diagnostics for existing skill targets (§10.1, C-UPD-39). */

import type { Outcome } from "../../install/update/types.ts";
import { sanitizeLine } from "../../util/redact.ts";

type UpdatedOutcome = Extract<Outcome, { kind: "updated" }>;

/** Failed or safety-skipped targets remain visible even after successful source staging. */
export function updatedRowStatus(
  outcome: UpdatedOutcome,
): "updated" | "partially updated" | "failed" | "skipped" {
  const incomplete = outcome.per_target.some((t) => t.kind === "failed" || t.kind === "skipped");
  if (!incomplete) return "updated";
  const completed = outcome.per_target.some(
    (t) => t.kind === "installed" || t.kind === "up_to_date",
  );
  if (completed) return "partially updated";
  return outcome.per_target.some((t) => t.kind === "failed") ? "failed" : "skipped";
}

/** Return only failed or safety-skipped target diagnostics, sanitizing displayed agent, code, message, and reason values. */
export function targetIssues(outcome: UpdatedOutcome): string[] {
  const issues: string[] = [];
  for (const target of outcome.per_target) {
    const agent = sanitizeLine(target.agent);
    if (target.kind === "skipped") {
      issues.push(`${agent}: skipped (${sanitizeLine(target.reason)})`);
    } else if (target.kind === "failed") {
      issues.push(
        `${agent}: failed (${sanitizeLine(target.error.code)}): ${sanitizeLine(target.error.message)}`,
      );
    }
  }
  return issues;
}
