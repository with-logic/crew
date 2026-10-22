/**
 * Human-friendly output for `crew update`.
 *
 * Renders tap warnings, aligned per-skill rows, tap additions, and totals.
 * Row-level formatting lives in `./rows.ts`.
 */

import type { TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { displayText } from "../../refs/display-url.ts";
import { columns, plural } from "../../util/format.ts";
import { sanitizeLine } from "../../util/redact.ts";
import type { Styler } from "../../util/term.ts";
import type { TapRefreshRow } from "../tap/refresh.ts";
import { projectTag } from "./location.ts";
import { formatRowParts, groupAdditions, nameCell } from "./rows.ts";
import { formatTotals, tally } from "./totals.ts";

/** A tap or namespace the user selected, with how many entries it expanded to. */
export interface CollectionSummary {
  readonly kind: "tap" | "namespace";
  readonly name: string;
  readonly count: number;
}

export interface RenderUpdateInput {
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
  /** §10.1.1: preview mode — rows say "would update" / "would add". */
  readonly dryRun?: boolean;
  /** §10.1: collection selectors, rendered as a header above the rows. */
  readonly collections?: readonly CollectionSummary[];
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

  // Collection selectors: one line each so the user sees what a tap or
  // namespace name expanded to (including "nothing installed").
  for (const c of input.collections ?? []) {
    const refreshed =
      c.kind === "tap" &&
      input.tapRows.some((row) => row.name === c.name && row.kind === "refreshed");
    const empty = `No skills installed from ${c.kind} ${c.name}${refreshed ? " — refreshed it anyway." : "."}`;
    lines.push(
      c.count === 0
        ? `${style.symbol("muted")} ${style.dim(empty)}`
        : `${style.bold(`Updating ${c.kind} ${c.name}`)} ${style.dim(`(${plural(c.count, "skill")})`)}`,
    );
  }

  // Header summarising what was checked.
  const checkedCount = input.rows.length;
  const dryRun = input.dryRun === true;
  const addedKind = dryRun ? "would_add" : "added";
  const addedRows = input.tapReexpandRows.filter((r) => r.kind === addedKind);
  if (checkedCount === 0 && addedRows.length === 0) {
    if ((input.collections ?? []).length === 0) {
      lines.push(style.dim("Nothing to update — Homecrew isn't tracking any skills yet."));
    }
    return lines;
  }
  if ((input.collections ?? []).length > 0) lines.push("");
  const header = `${plural(checkedCount, "skill")}${dryRun ? " (dry run)" : ""}`;
  lines.push(style.bold(`Checked ${header}`));
  lines.push("");

  // Per-skill rows, aligned. Project-scope rows get a dim "in <path>"
  // tag so the user can tell which of several installs of the same
  // name is which.
  if (input.rows.length > 0) {
    const rowCells: string[][] = input.rows.map((r) => {
      const parts = formatRowParts(r, style);
      const tailCells: string[] = [];
      if (parts.detail) tailCells.push(parts.detail);
      if (parts.required) tailCells.push(parts.required);
      return [nameCell(r, style), parts.status, tailCells.join(" ")];
    });
    for (const line of columns(rowCells, 2)) lines.push(line);
  }

  // Tap additions: "gained X new skills from tap Y".
  const additions = groupAdditions(addedRows);
  if (additions.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    for (const group of additions) {
      const sym = style.symbol("ok");
      const count = plural(group.names.length, "new skill");
      const verb = dryRun ? "would add " : "";
      lines.push(
        `${sym} ${verb}${count} from ${style.bold(group.tap)}${projectTag(group, style)}: ${group.names.join(", ")}`,
      );
    }
  }

  for (const row of addedRows) {
    for (const warning of (row.kind === "added" ? row.warnings : undefined) ?? []) {
      lines.push(
        `${style.symbol("warn")} ${style.bold(row.name)}${projectTag(row, style)} ${style.dim(`(from ${row.tap})`)}: ${warning}`,
      );
    }
  }

  // Re-expansion errors name the subject and reason (§10.1.1), including
  // tap access, child validation, staging, and target-install failures.
  const errorRows = input.tapReexpandRows.filter((r) => r.kind === "tap_error");
  for (const r of errorRows) {
    const code = r.error.code;
    lines.push(
      `${style.symbol("fail")} ${style.bold(r.name)}${projectTag(r, style)} ${style.dim(`(from ${r.tap})`)} ${style.red(code)}`,
    );
    if (r.error.message) lines.push(style.dim(`  ${r.error.message}`));
    if (r.error.remedy)
      lines.push(style.dim(sanitizeLine(displayText(`  Next step: ${r.error.remedy}`))));
  }

  const totals = tally(input.rows, addedRows.length, errorRows.length);
  lines.push("");
  lines.push(style.dim(formatTotals(totals, dryRun)));

  return lines;
}
