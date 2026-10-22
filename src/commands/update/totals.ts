/** Update outcome totals and their human summary (§10.1, §10.1.1). */

import type { Outcome, UpdateRow } from "../../install/update/types.ts";
import { plural } from "../../util/format.ts";
import { updatedRowStatus } from "./targets.ts";

interface Totals {
  updated: number;
  partial: number;
  upToDate: number;
  skipped: number;
  sourceGone: number;
  tapMissing: number;
  failed: number;
  added: number;
}

export function tally(
  rows: readonly UpdateRow[],
  addedCount: number,
  tapErrorCount: number,
): Totals {
  const t: Totals = {
    updated: 0,
    partial: 0,
    upToDate: 0,
    skipped: 0,
    sourceGone: 0,
    tapMissing: 0,
    // Re-expansion errors also count toward the exit-1 failure summary (§10.1.1).
    failed: tapErrorCount,
    added: addedCount,
  };
  for (const r of rows) {
    const o = r.outcome;
    const k = o.kind;
    if (o.kind === "updated") {
      const status = updatedRowStatus(o);
      const counters = {
        updated: "updated",
        "partially updated": "partial",
        failed: "failed",
        skipped: "skipped",
      } satisfies Record<
        ReturnType<typeof updatedRowStatus>,
        "updated" | "partial" | "failed" | "skipped"
      >;
      t[counters[status]]++;
      if (status === "partially updated" && o.per_target.some((target) => target.kind === "failed"))
        t.failed++;
    } else if (k === "would_update") t.updated++;
    else if (k === "up_to_date") t.upToDate++;
    else if (k === "skipped" || k === "missing_project_root") t.skipped++;
    else if (k === "source_gone") t.sourceGone++;
    else if (k === "tap_missing") t.tapMissing++;
    else {
      // Only `failed` remains; `satisfies` turns a newly added
      // `Outcome` kind into a compile error rather than silently
      // counting it as a failure.
      o satisfies Extract<Outcome, { kind: "failed" }>;
      t.failed++;
    }
  }
  return t;
}

export function formatTotals(t: Totals, dryRun: boolean): string {
  const parts: string[] = [];
  if (t.updated > 0) parts.push(`${t.updated} ${dryRun ? "would update" : "updated"}`);
  if (t.partial > 0) parts.push(`${t.partial} partially updated`);
  if (t.added > 0) parts.push(`${t.added} ${dryRun ? "would add" : "new"}`);
  if (t.upToDate > 0) parts.push(`${t.upToDate} up to date`);
  if (t.skipped > 0) parts.push(`${t.skipped} skipped`);
  if (t.tapMissing > 0) parts.push(`${t.tapMissing} with a removed tap`);
  if (t.sourceGone > 0) parts.push(`${t.sourceGone} with unavailable sources`);
  if (t.failed > 0) parts.push(plural(t.failed, "failure"));
  if (parts.length === 0) return "nothing changed";
  return parts.join(" · ");
}
