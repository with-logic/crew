/**
 * Human-friendly output for `crew outdated` (§10.1.1).
 *
 * A trimmed view of the update preview: only rows that would change
 * (`would_update`, `would_add`, `source_gone`, failures) are listed;
 * `up_to_date` and `skipped` rows are dropped as noise. Tap-refresh
 * warnings still show first so a stale answer is visibly stale. Row
 * formatting is shared with `crew update`.
 *
 * When a tap couldn't be refreshed or re-expanded, the answer is drawn
 * from a possibly-stale local clone, so the closing line says results
 * may be incomplete rather than claiming everything is up to date —
 * "up to date" must never mean "we couldn't check" (C-UPD-18h).
 */

import type { TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { columns, plural } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { TapRefreshRow } from "../tap/refresh.ts";
import { formatRowParts, groupByTap, nameCell } from "../update/rows.ts";

export interface RenderOutdatedInput {
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
}

/**
 * Which outcome kinds answer "what would change?".
 *
 * Exhaustive by type: every kind in the row union must appear here, so
 * adding one is a compile error until someone decides whether it is
 * noteworthy. A `satisfies`-checked list of only the included kinds
 * would not catch that — a new kind would simply be absent and vanish
 * behind "Everything is up to date."
 */
const NOTEWORTHY: Record<UpdateRow["outcome"]["kind"], boolean> = {
  would_update: true,
  source_gone: true,
  failed: true,
  // Not noteworthy: these answer "nothing to do here".
  up_to_date: false,
  updated: false,
  skipped: false,
  // A missing project root is a skip, not a pending change: C-UPD-22
  // specifies it is "reported and SKIPPED on update", `formatRowParts`
  // renders it with the "skipped" status word, and `crew update` counts
  // it in the skipped tally. §10.1.1 trims skips from this view. The
  // condition is real but it is `crew doctor`'s to report (C-STATE-11),
  // and `crew update` would not change the install either way.
  missing_project_root: false,
};

export function renderOutdated(input: RenderOutdatedInput, style: Styler): string[] {
  const lines: string[] = [];
  let couldNotCheck = false;

  for (const tr of input.tapRows) {
    if (tr.kind === "failed") {
      couldNotCheck = true;
      const code = tr.error?.code ?? "unreachable";
      lines.push(
        `${style.symbol("warn")} couldn't refresh tap ${style.bold(tr.name)} ${style.dim(`(${code})`)}`,
      );
      lines.push(style.dim("  showing what's known from the last-fetched copy"));
    }
  }
  for (const r of input.tapReexpandRows) {
    if (r.kind === "tap_error") {
      couldNotCheck = true;
      // Name the child and the reason, as `crew update` does: a child
      // that failed validation is the user's to fix, and "tap acme
      // (invalid_skill)" alone would not tell them which skill broke.
      const code = r.error?.code ?? "unreachable";
      lines.push(
        `${style.symbol("warn")} ${style.bold(r.name)} ${style.dim(`(from ${r.tap})`)} ${style.red(code)}`,
      );
      if (r.error?.message) lines.push(style.dim(`  ${r.error.message}`));
    }
  }
  if (lines.length > 0) lines.push("");

  const rows = input.rows.filter((r) => NOTEWORTHY[r.outcome.kind]);
  const added = input.tapReexpandRows.filter((r) => r.kind === "would_add");
  if (rows.length === 0 && added.length === 0) {
    // A failed refresh means we never saw upstream — saying "up to
    // date" would assert something we couldn't verify.
    lines.push(
      couldNotCheck
        ? `${style.symbol("warn")} Nothing known to be out of date, but some collections couldn't be checked.`
        : `${style.symbol("ok")} Everything is up to date.`,
    );
    return lines;
  }

  if (rows.length > 0) {
    lines.push(style.bold(`${plural(rows.length, "skill")} would change`));
    lines.push("");
    const cells: string[][] = rows.map((r) => {
      const parts = formatRowParts(r, style);
      const tail = [parts.detail, parts.required].filter((s) => s.length > 0).join(" ");
      return [nameCell(r, style), parts.status, tail];
    });
    for (const line of columns(cells, 2)) lines.push(line);
  }

  if (added.length > 0) {
    // Only separate from a preceding row section — warnings already
    // emit their own trailing blank line.
    if (rows.length > 0) lines.push("");
    for (const [tap, names] of groupByTap(added)) {
      lines.push(
        `${style.symbol("ok")} ${plural(names.length, "new skill")} available from ${style.bold(tap)}: ${names.join(", ")}`,
      );
    }
  }

  lines.push("");
  lines.push(style.dim("Run `crew update` to apply."));
  if (couldNotCheck) {
    lines.push(style.dim("Some collections couldn't be checked; results may be incomplete."));
  }
  return lines;
}
