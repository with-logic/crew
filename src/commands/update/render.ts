/**
 * Human-friendly output for `crew update`.
 *
 * Layout:
 *   - Tap-level warnings (offline taps, fetch errors) at the top.
 *   - A header with how many skills were checked.
 *   - One aligned row per skill: symbol, bold name, colored status word,
 *     version tail (short SHA or "→ new SHA").
 *   - Tap additions ("gained X new skill from tap Y") if any.
 *   - Dim totals line at the bottom.
 */

import type { TapReexpandRow } from "../../install/tap-reexpand.ts";
import type { UpdateRow } from "../../install/update-one.ts";
import { columns, plural } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { TapRefreshRow } from "../tap/refresh.ts";

export interface RenderUpdateInput {
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
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
  const addedRows = input.tapReexpandRows.filter((r) => r.kind === "added");
  if (checkedCount === 0 && addedRows.length === 0) {
    lines.push(style.dim("Nothing to update — crew isn't tracking any skills yet."));
    return lines;
  }
  const header = checkedCount === 1 ? `Checked 1 skill` : `Checked ${checkedCount} skills`;
  lines.push(style.bold(header));
  lines.push("");

  // Per-skill rows, aligned.
  if (input.rows.length > 0) {
    const rowCells: string[][] = input.rows.map((r) => {
      const parts = formatRowParts(r, style);
      const sym = symbolFor(r, style);
      const tailCells: string[] = [];
      if (parts.detail) tailCells.push(parts.detail);
      if (parts.required) tailCells.push(parts.required);
      return [`  ${sym} ${style.bold(r.name)}`, parts.status, tailCells.join(" ")];
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
      lines.push(`${sym} ${count} from ${style.bold(tap)}: ${names.join(", ")}`);
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
  lines.push(style.dim(formatTotals(totals)));

  return lines;
}

interface RowParts {
  readonly status: string;
  readonly detail: string;
  readonly required: string;
}

function formatRowParts(row: UpdateRow, style: Styler): RowParts {
  const o = row.outcome;
  const required =
    row.transitively_required_by && row.transitively_required_by.length > 0
      ? style.dim(`(required by ${row.transitively_required_by.join(", ")})`)
      : "";

  if (o.kind === "up_to_date") {
    return { status: style.dim("up to date"), detail: "", required };
  }
  if (o.kind === "updated") {
    const shortSha = o.new_sha.slice(0, 8);
    return { status: style.green("updated"), detail: style.cyan(shortSha), required };
  }
  if (o.kind === "skipped") {
    return { status: style.dim("skipped"), detail: style.dim(o.reason), required };
  }
  if (o.kind === "source_gone") {
    return {
      status: style.yellow("removed upstream"),
      detail: style.dim("keeping your copy"),
      required,
    };
  }
  if (o.kind === "missing_project_root") {
    return {
      status: style.dim("skipped"),
      detail: style.dim(`project folder no longer exists: ${o.root}`),
      required,
    };
  }
  return {
    status: style.red("failed"),
    detail: style.red(o.error.code.replace(/_/g, " ")),
    required,
  };
}

function symbolFor(row: UpdateRow, style: Styler): string {
  const o = row.outcome;
  if (o.kind === "updated") return style.symbol("ok");
  if (o.kind === "up_to_date") return style.symbol("muted");
  if (o.kind === "skipped" || o.kind === "missing_project_root") return style.symbol("muted");
  if (o.kind === "source_gone") return style.symbol("warn");
  return style.symbol("fail");
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
    if (k === "updated") t.updated++;
    else if (k === "up_to_date") t.upToDate++;
    else if (k === "skipped" || k === "missing_project_root") t.skipped++;
    else if (k === "source_gone") t.sourceGone++;
    else t.failed++;
  }
  return t;
}

function formatTotals(t: Totals): string {
  const parts: string[] = [];
  if (t.updated > 0) parts.push(`${t.updated} updated`);
  if (t.added > 0) parts.push(`${t.added} new`);
  if (t.upToDate > 0) parts.push(`${t.upToDate} up to date`);
  if (t.skipped > 0) parts.push(`${t.skipped} skipped`);
  if (t.sourceGone > 0) parts.push(`${t.sourceGone} removed upstream`);
  if (t.failed > 0) parts.push(plural(t.failed, "failure"));
  if (parts.length === 0) return "nothing changed";
  return parts.join(" · ");
}
