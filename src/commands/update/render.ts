/**
 * Human-friendly output for `crew update`.
 *
 * Renders tap warnings, aligned per-skill rows, tap additions, and totals.
 * Row-level formatting lives in `./rows.ts`.
 */

import type { TapReexpandRow } from "../../install/tap-reexpand.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { columns, plural, shortenHome } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { TapRefreshRow } from "../tap/refresh.ts";
import { formatRowParts, symbolFor } from "./rows.ts";

export interface RenderUpdateInput {
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
  /** §10.1.1: preview mode — rows say "would update" / "would add". */
  readonly dryRun?: boolean;
}

export function renderUpdate(input: RenderUpdateInput, style: Styler): string[] {
  const lines: string[] = [];

  // Tap refresh warnings first so users see network issues up top.
  for (const tr of input.tapRows) {
    if (tr.kind === "failed") {
      const code = tr.error?.code ?? "unreachable";
      lines.push(
        `${style.symbol("warn")} couldn't refresh tap ${style.bold(tr.name)} ${style.dim(`(${code})`)}`,
      );
      lines.push(
        style.dim(`  using the last-fetched copy; try \`crew tap update ${tr.name}\` later`),
      );
    }
  }
  if (lines.length > 0) lines.push("");

  // Header summarising what was checked.
  const checkedCount = input.rows.length;
  const dryRun = input.dryRun === true;
  const addedKind = dryRun ? "would_add" : "added";
  const addedRows = input.tapReexpandRows.filter((r) => r.kind === addedKind);
  if (checkedCount === 0 && addedRows.length === 0) {
    lines.push(style.dim("Nothing to update — Homecrew isn't tracking any skills yet."));
    return lines;
  }
  const header = `${plural(checkedCount, "skill")}${dryRun ? " (dry run)" : ""}`;
  lines.push(style.bold(`Checked ${header}`));
  lines.push("");

  // Per-skill rows, aligned. Project-scope rows get a dim "in <path>"
  // tag so the user can tell which of several installs of the same
  // name is which.
  if (input.rows.length > 0) {
    const rowCells: string[][] = input.rows.map((r) => {
      const parts = formatRowParts(r, style);
      const sym = symbolFor(r, style);
      const tailCells: string[] = [];
      if (parts.detail) tailCells.push(parts.detail);
      if (parts.required) tailCells.push(parts.required);
      const nameCell =
        r.scope === "project" && r.project_root
          ? `  ${sym} ${style.bold(r.name)} ${style.dim(`(in ${shortenHome(r.project_root)})`)}`
          : `  ${sym} ${style.bold(r.name)}`;
      return [nameCell, parts.status, tailCells.join(" ")];
    });
    for (const line of columns(rowCells, 2)) lines.push(line);
  }

  // Tap additions: "gained X new skills from tap Y".
  const addedByTap = groupByTap(addedRows);
  if (addedByTap.size > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    for (const [tap, names] of addedByTap) {
      const sym = style.symbol("ok");
      const count = plural(names.length, "new skill");
      const verb = dryRun ? "would add " : "";
      lines.push(`${sym} ${verb}${count} from ${style.bold(tap)}: ${names.join(", ")}`);
    }
  }

  // Tap-level fetch errors surfaced by re-expansion (distinct from the
  // initial tapRefresh step — this is when the tap was needed and still
  // couldn't be reached).
  for (const r of input.tapReexpandRows) {
    if (r.kind === "tap_error") {
      lines.push(
        `${style.symbol("warn")} tap ${style.bold(r.tap)} ${style.dim(`(${r.error?.code ?? "unreachable"})`)}`,
      );
    }
  }

  const totals = tally(input.rows, addedRows.length);
  lines.push("");
  lines.push(style.dim(formatTotals(totals, dryRun)));

  return lines;
}

function groupByTap(rows: readonly TapReexpandRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!out.has(r.tap)) out.set(r.tap, []);
    out.get(r.tap)!.push(r.name);
  }
  return out;
}

interface Totals {
  updated: number;
  upToDate: number;
  skipped: number;
  sourceGone: number;
  failed: number;
  added: number;
}

function tally(rows: readonly UpdateRow[], addedCount: number): Totals {
  const t: Totals = {
    updated: 0,
    upToDate: 0,
    skipped: 0,
    sourceGone: 0,
    failed: 0,
    added: addedCount,
  };
  for (const r of rows) {
    const k = r.outcome.kind;
    if (k === "updated" || k === "would_update") t.updated++;
    else if (k === "up_to_date") t.upToDate++;
    else if (k === "skipped" || k === "missing_project_root") t.skipped++;
    else if (k === "source_gone") t.sourceGone++;
    else t.failed++;
  }
  return t;
}

function formatTotals(t: Totals, dryRun: boolean): string {
  const parts: string[] = [];
  if (t.updated > 0) parts.push(`${t.updated} ${dryRun ? "would update" : "updated"}`);
  if (t.added > 0) parts.push(`${t.added} ${dryRun ? "would add" : "new"}`);
  if (t.upToDate > 0) parts.push(`${t.upToDate} up to date`);
  if (t.skipped > 0) parts.push(`${t.skipped} skipped`);
  if (t.sourceGone > 0) parts.push(`${t.sourceGone} removed upstream`);
  if (t.failed > 0) parts.push(plural(t.failed, "failure"));
  if (parts.length === 0) return "nothing changed";
  return parts.join(" · ");
}
