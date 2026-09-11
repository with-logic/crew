/**
 * Human-friendly output for `crew outdated` (§10.1.1).
 *
 * A trimmed view of the update preview: only rows that would change
 * (`would_update`, `would_add`, `source_gone`, `missing_project_root`,
 * failures) are listed; `up_to_date` and `skipped` rows are dropped as
 * noise. Tap-refresh warnings still show first so a stale answer is
 * visibly stale. Row formatting is shared with `crew update`.
 *
 * When a tap couldn't be refreshed or re-expanded, the answer is drawn
 * from a possibly-stale local clone, so the closing line says results
 * may be incomplete rather than claiming everything is up to date —
 * "up to date" must never mean "we couldn't check" (C-UPD-18f).
 */

import type { TapReexpandRow } from "../../install/tap-reexpand.ts";
import type { UpdateRow } from "../../install/update/types.ts";
import { columns, plural, shortenHome } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { TapRefreshRow } from "../tap/refresh.ts";
import { formatRowParts, symbolFor } from "../update/rows.ts";

export interface RenderOutdatedInput {
  readonly rows: readonly UpdateRow[];
  readonly tapReexpandRows: readonly TapReexpandRow[];
  readonly tapRows: readonly TapRefreshRow[];
}

/**
 * Outcome kinds that answer "what would change?". Typed against the
 * row union so a renamed or mistyped kind is a compile error rather
 * than a row that silently stops being reported.
 */
const NOTEWORTHY: ReadonlySet<UpdateRow["outcome"]["kind"]> = new Set([
  "would_update",
  "source_gone",
  "missing_project_root",
  "failed",
] satisfies UpdateRow["outcome"]["kind"][]);

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
      lines.push(
        `${style.symbol("warn")} tap ${style.bold(r.tap)} ${style.dim(`(${r.error?.code ?? "unreachable"})`)}`,
      );
    }
  }
  if (lines.length > 0) lines.push("");

  const rows = input.rows.filter((r) => NOTEWORTHY.has(r.outcome.kind));
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
      const where =
        r.scope === "project" && r.project_root
          ? ` ${style.dim(`(in ${shortenHome(r.project_root)})`)}`
          : "";
      return [`  ${symbolFor(r, style)} ${style.bold(r.name)}${where}`, parts.status, tail];
    });
    for (const line of columns(cells, 2)) lines.push(line);
  }

  if (added.length > 0) {
    // Only separate from a preceding row section — warnings already
    // emit their own trailing blank line.
    if (rows.length > 0) lines.push("");
    const byTap = new Map<string, string[]>();
    for (const r of added) {
      if (!byTap.has(r.tap)) byTap.set(r.tap, []);
      byTap.get(r.tap)!.push(r.name);
    }
    for (const [tap, names] of byTap) {
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
