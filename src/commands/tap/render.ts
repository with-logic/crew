/**
 * Human-friendly output for `crew tap {list,remove,update}`.
 *
 * (The `add` command has its own rendering in `./add.ts` because it
 * threads outcome state through `withStateLock`.)
 */

import { columns, plural, timeAgo } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { TapRefreshRow } from "./refresh.ts";

/** Row shape produced by the list command's data-gathering pass. */
export interface TapListRow {
  readonly name: string;
  readonly kind: "git" | "path";
  readonly registered: boolean;
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
    const flag = r.registered ? style.dim("registered") : style.dim("auto");
    const fetched = formatFetched(r, style);
    return [`  ${sym}`, style.bold(r.name), flag, r.target, fetched];
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

export function renderTapRemove(name: string, kind: "git" | "path", style: Styler): string[] {
  const lines: string[] = [];
  lines.push(`${style.symbol("ok")} Removed tap ${style.bold(name)}`);
  if (kind === "git") {
    lines.push(style.dim("  local clone deleted"));
  } else {
    lines.push(style.dim("  (the local folder itself wasn't touched)"));
  }
  return lines;
}

export function renderTapUpdate(rows: readonly TapRefreshRow[], style: Styler): string[] {
  if (rows.length === 0) {
    return [style.dim("No taps to update.")];
  }
  const lines: string[] = [];
  const refreshed = rows.filter((r) => r.kind === "refreshed").length;
  const skipped = rows.filter((r) => r.kind === "skipped").length;
  const failed = rows.filter((r) => r.kind === "failed").length;

  lines.push(style.bold(`Refreshing ${plural(rows.length, "tap")}`));
  lines.push("");

  const cells: string[][] = rows.map((r) => {
    const sym = statusSymbol(r, style);
    const status = statusWord(r, style);
    const detail = detailFor(r, style);
    return [`  ${sym}`, style.bold(r.name), status, detail];
  });
  for (const line of columns(cells, 2)) lines.push(line);

  lines.push("");
  lines.push(style.dim(formatTapTotals(refreshed, skipped, failed)));
  return lines;
}

function statusSymbol(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed") return style.symbol("ok");
  if (r.kind === "skipped") return style.symbol("muted");
  return style.symbol("fail");
}

function statusWord(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed") return style.green("refreshed");
  if (r.kind === "skipped") return style.dim("skipped");
  return style.red("failed");
}

function detailFor(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed") return style.dim(r.url ?? "");
  if (r.kind === "skipped") return style.dim(r.reason ?? "local folder, nothing to fetch");
  return style.red(r.error?.code ?? "unknown");
}

function formatTapTotals(refreshed: number, skipped: number, failed: number): string {
  const parts: string[] = [];
  if (refreshed > 0) parts.push(`${refreshed} refreshed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(plural(failed, "failure"));
  return parts.length === 0 ? "nothing changed" : parts.join(" · ");
}
