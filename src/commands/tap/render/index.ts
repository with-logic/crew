/**
 * Human-friendly output for `crew tap {list,remove,update}` (§16.3).
 * `crew tap add` renders from `./add.ts`.
 *
 * Every mutating subcommand takes a `dryRun` flag: the same shape is
 * rendered with "would …" verbs and a dim "(dry run)" tag, and the
 * JSON payload carries `dry_run: true`.
 */

import { columns, plural, timeAgo } from "../../../util/format.ts";
import type { Styler } from "../../../util/term.ts";
import type { TapRefreshRow } from "../refresh.ts";

/** Row shape produced by the list command's data-gathering pass. */
export interface TapListRow {
  readonly name: string;
  readonly kind: "git" | "path";
  readonly registered: boolean;
  readonly discovery: "standard" | "recursive";
  readonly target: string;
  readonly last_fetched: string | null;
}

export function renderTapList(rows: readonly TapListRow[], style: Styler): string[] {
  const lines: string[] = [];
  lines.push(style.bold(`Taps (${rows.length})`));
  lines.push("");

  if (rows.length === 0) {
    lines.push(style.dim("No taps configured. Add one with `crew tap add <url>`."));
    return lines;
  }

  const cells: string[][] = rows.map((r) => {
    const sym = r.registered ? style.symbol("ok") : style.symbol("muted");
    const flag = r.registered ? "registered" : "auto";
    const mode = r.discovery === "recursive" ? `${flag}, recursive` : flag;
    const fetched = formatFetched(r, style);
    return [`  ${sym}`, style.bold(r.name), style.dim(mode), r.target, fetched];
  });
  for (const line of columns(cells, 2)) lines.push(line);

  lines.push("");
  lines.push(style.dim("Refresh with `crew tap update`."));
  return lines;
}

function formatFetched(r: TapListRow, style: Styler): string {
  if (r.kind === "path") return style.dim("(local folder)");
  if (!r.last_fetched) return style.dim("(not fetched yet)");
  return style.dim(`fetched ${timeAgo(r.last_fetched)}`);
}

export function renderTapUpdate(
  rows: readonly TapRefreshRow[],
  dryRun: boolean,
  style: Styler,
): string[] {
  if (rows.length === 0) {
    return [style.dim("No taps to update.")];
  }
  const lines: string[] = [];
  // Counted by outcome. `succeeded` spans the two ways a tap with an
  // upstream comes out well — actually refreshed on a real run,
  // `pending` on a preview — and deliberately excludes `failed`, which
  // is also fetchable but didn't succeed.
  const succeeded = rows.filter((r) => r.kind === "refreshed" || r.kind === "pending").length;
  const skipped = rows.filter((r) => r.kind === "skipped").length;
  const failed = rows.filter((r) => r.kind === "failed").length;

  const tag = dryRun ? style.dim(" (dry run)") : "";
  const verb = dryRun ? "Would refresh" : "Refreshing";
  lines.push(style.bold(`${verb} ${plural(rows.length, "tap")}${tag}`));
  lines.push("");

  const cells: string[][] = rows.map((r) => {
    const sym = statusSymbol(r, style);
    const status = statusWord(r, style);
    const detail = detailFor(r, style);
    return [`  ${sym}`, style.bold(r.name), status, detail];
  });
  for (const line of columns(cells, 2)) lines.push(line);

  lines.push("");
  lines.push(style.dim(formatTapTotals(succeeded, skipped, failed, dryRun)));
  return lines;
}

function statusSymbol(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed" || r.kind === "pending") return style.symbol("ok");
  if (r.kind === "skipped") return style.symbol("muted");
  r satisfies Extract<TapRefreshRow, { kind: "failed" }>;
  return style.symbol("fail");
}

function statusWord(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed") return style.green("refreshed");
  if (r.kind === "pending") return style.green("would fetch");
  if (r.kind === "skipped") return style.dim("skipped");
  // Only `failed` remains; `satisfies` turns a newly added row kind into
  // a compile error rather than silently rendering as a failure.
  r satisfies Extract<TapRefreshRow, { kind: "failed" }>;
  return style.red("failed");
}

function detailFor(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed" || r.kind === "pending") return style.dim(r.url);
  if (r.kind === "skipped") return style.dim(r.reason);
  r satisfies Extract<TapRefreshRow, { kind: "failed" }>;
  return style.red(r.error.code);
}

function formatTapTotals(
  succeeded: number,
  skipped: number,
  failed: number,
  dryRun: boolean,
): string {
  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} ${dryRun ? "would be fetched" : "refreshed"}`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(plural(failed, "failure"));
  return parts.length === 0 ? "nothing changed" : parts.join(" · ");
}
