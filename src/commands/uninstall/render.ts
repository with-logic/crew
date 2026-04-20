/**
 * Human-friendly output for `crew uninstall`.
 *
 * One block per skill the user asked to remove, each with a ✓-per-target
 * section, then a separate "Pruned dependencies" section listing any
 * orphans pulled along by `--prune`. Dim totals line at the bottom.
 */

import { plural } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { UninstallRecord } from "./core.ts";

const FAIL_REMEDIES: Record<string, string> = {
  untracked_directory: "something else owns that folder (pass --force to remove anyway)",
  inconsistent_marker: "the install site looks tampered with (pass --force to remove)",
  not_installed_here: "wasn't installed here (pass --force to ignore)",
};

export function renderUninstall(records: readonly UninstallRecord[], style: Styler): string[] {
  const direct = records.filter((r) => !r.pruned);
  const pruned = records.filter((r) => r.pruned);

  const lines: string[] = [];

  if (direct.length > 0) {
    const subjects = direct.map((r) => r.name);
    const header =
      subjects.length === 1
        ? `Uninstalling ${subjects[0]}`
        : `Uninstalling ${plural(subjects.length, "skill")}`;
    lines.push(style.bold(header));
    for (const r of direct) {
      lines.push("");
      lines.push(...renderRecord(r, style));
    }
  }

  if (pruned.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(style.bold(`Pruned ${plural(pruned.length, "dependency", "dependencies")}`));
    for (const r of pruned) {
      lines.push("");
      lines.push(...renderRecord(r, style));
    }
  }

  const totals = tally(records);
  if (totals.removals > 0 || totals.failures > 0) {
    lines.push("");
    lines.push(style.dim(formatTotals(totals)));
  }

  return lines;
}

function renderRecord(r: UninstallRecord, style: Styler): string[] {
  const lines: string[] = [];
  const tag = r.partial ? style.dim("(kept elsewhere)") : "";
  const header = [style.bold(r.name), tag].filter((s) => s.length > 0).join(" ");
  lines.push(`  ${header}`);
  for (const agent of r.removedFrom) {
    lines.push(`    ${style.symbol("ok")} ${agent}`);
  }
  for (const agent of r.absentFrom) {
    lines.push(`    ${style.symbol("muted")} ${agent} ${style.dim("(wasn't there)")}`);
  }
  for (const fail of r.failures) {
    const remedy = FAIL_REMEDIES[fail.error.code] ?? fail.error.code.replace(/_/g, " ");
    lines.push(`    ${style.symbol("fail")} ${fail.agent}  ${style.red(remedy)}`);
  }
  if (r.removedFrom.length === 0 && r.absentFrom.length === 0 && r.failures.length === 0) {
    lines.push(`    ${style.dim("nothing to remove")}`);
  }
  return lines;
}

interface Totals {
  removals: number;
  failures: number;
  pruned: number;
}

function tally(records: readonly UninstallRecord[]): Totals {
  const t: Totals = { removals: 0, failures: 0, pruned: 0 };
  for (const r of records) {
    t.removals += r.removedFrom.length;
    t.failures += r.failures.length;
    if (r.pruned) t.pruned++;
  }
  return t;
}

function formatTotals(totals: Totals): string {
  const parts: string[] = [];
  if (totals.removals > 0) {
    parts.push(`removed from ${plural(totals.removals, "agent")}`);
  }
  if (totals.pruned > 0) {
    parts.push(`pruned ${plural(totals.pruned, "dependency", "dependencies")}`);
  }
  if (totals.failures > 0) {
    parts.push(plural(totals.failures, "failure"));
  }
  return parts.join(" · ");
}
