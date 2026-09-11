/**
 * Human-friendly output for `crew outdated` (§10.1.1).
 *
 * A trimmed view of the update preview: only rows that would change
 * (`would_update`, `would_add`, `source_gone`, `missing_project_root`,
 * failures) are listed; `up_to_date` and `skipped` rows are dropped as
 * noise. Tap-refresh warnings still show first so a stale answer is
 * visibly stale. Row formatting is shared with `crew update`.
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

/** Outcome kinds that answer "what would change?". */
const NOTEWORTHY = new Set(["would_update", "source_gone", "missing_project_root", "failed"]);

export function renderOutdated(input: RenderOutdatedInput, style: Styler): string[] {
  const lines: string[] = [];

  for (const tr of input.tapRows) {
    if (tr.kind === "failed") {
      const code = tr.error?.code ?? "unreachable";
      lines.push(
        `${style.symbol("warn")} couldn't refresh tap ${style.bold(tr.name)} ${style.dim(`(${code})`)}`,
      );
      lines.push(style.dim("  showing what's known from the last-fetched copy"));
    }
  }
  for (const r of input.tapReexpandRows) {
    if (r.kind === "tap_error") {
      lines.push(
        `${style.symbol("warn")} tap ${style.bold(r.tap)} ${style.dim(`(${r.error?.code ?? "unreachable"})`)}`,
      );
    }
  }
  if (lines.length > 0) lines.push("");

  const rows = input.rows.filter((r) => NOTEWORTHY.has(r.outcome.kind));
  const added = input.tapReexpandRows.filter((r) => r.kind === "would_add");
  if (rows.length === 0 && added.length === 0) {
    lines.push(`${style.symbol("ok")} Everything is up to date.`);
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
    if (lines.length > 0) lines.push("");
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
  return lines;
}
