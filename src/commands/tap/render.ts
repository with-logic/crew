/**
 * Human-friendly output for `crew tap {add,list,remove,update}` (§16.3).
 *
 * Every mutating subcommand takes a `dryRun` flag: the same shape is
 * rendered with "would …" verbs and a dim "(dry run)" tag, and the
 * JSON payload carries `dry_run: true`.
 */

import { columns, plural, timeAgo } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { CommandOutput } from "../types.ts";
import type { TapRefreshRow } from "./refresh.ts";
import { displayTarget, payloadOf, type TapAddTarget } from "./target.ts";

/** Row shape produced by the list command's data-gathering pass. */
export interface TapListRow {
  readonly name: string;
  readonly kind: "git" | "path";
  readonly registered: boolean;
  readonly discovery: "standard" | "recursive";
  readonly target: string;
  readonly last_fetched: string | null;
}

/** What `crew tap add` decided to do (or would do, under `--dry-run`). */
export type TapAddOutcome = "added" | "no-op" | "promoted" | "updated";

export function renderTapAdd(
  outcome: TapAddOutcome,
  name: string,
  target: TapAddTarget,
  dryRun: boolean,
  style: Styler,
): CommandOutput {
  const targetStr = displayTarget(target);
  const tag = dryRun ? style.dim(" (dry run)") : "";
  const payload = { name, ...payloadOf(target), ...(dryRun ? { dry_run: true } : {}) };
  if (outcome === "no-op") {
    return {
      exitCode: 0,
      human: [
        `${style.symbol("muted")} Tap ${style.bold(name)} is already set up${tag}`,
        style.dim(`  pointed at ${targetStr}`),
      ],
      json: { ...payload, already: true },
    };
  }
  if (outcome === "promoted") {
    const verb = dryRun ? "Would promote" : "Promoted";
    return {
      exitCode: 0,
      human: [
        `${style.symbol("ok")} ${verb} ${style.bold(name)} to a saved tap${tag}`,
        style.dim(`  ${dryRun ? "would track" : "now tracking"} ${targetStr}`),
      ],
      json: { ...payload, promoted: true },
    };
  }
  if (outcome === "updated") {
    const verb = dryRun ? "Would update" : "Updated";
    return {
      exitCode: 0,
      human: [
        `${style.symbol("ok")} ${verb} tap ${style.bold(name)}${tag}`,
        style.dim(`  recursive discovery ${dryRun ? "would be " : ""}enabled for ${targetStr}`),
      ],
      json: { ...payload, updated: true, discovery: "recursive" },
    };
  }
  const human = [
    `${style.symbol("ok")} ${dryRun ? "Would add" : "Added"} tap ${style.bold(name)}${tag}`,
    style.dim(`  from ${targetStr}`),
  ];
  if (!dryRun)
    human.push(style.dim("  try `crew search <query>` or `crew install <name>` to use it"));
  return { exitCode: 0, human, json: payload };
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

export function renderTapRemove(
  name: string,
  kind: "git" | "path",
  dryRun: boolean,
  style: Styler,
): string[] {
  const tag = dryRun ? style.dim(" (dry run)") : "";
  const lines: string[] = [];
  lines.push(
    `${style.symbol("ok")} ${dryRun ? "Would remove" : "Removed"} tap ${style.bold(name)}${tag}`,
  );
  if (kind === "git") {
    lines.push(style.dim(dryRun ? "  local clone would be deleted" : "  local clone deleted"));
  } else {
    const verb = dryRun ? "wouldn't be" : "wasn't";
    lines.push(style.dim(`  (the local folder itself ${verb} touched)`));
  }
  return lines;
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
  const refreshed = rows.filter((r) => r.kind === "refreshed" || r.kind === "pending").length;
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
  lines.push(style.dim(formatTapTotals(refreshed, skipped, failed, dryRun)));
  return lines;
}

function statusSymbol(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed" || r.kind === "pending") return style.symbol("ok");
  if (r.kind === "skipped") return style.symbol("muted");
  return style.symbol("fail");
}

function statusWord(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed") return style.green("refreshed");
  if (r.kind === "pending") return style.green("would fetch");
  if (r.kind === "skipped") return style.dim("skipped");
  return style.red("failed");
}

function detailFor(r: TapRefreshRow, style: Styler): string {
  if (r.kind === "refreshed" || r.kind === "pending") return style.dim(r.url ?? "");
  if (r.kind === "skipped") return style.dim(r.reason ?? "local folder, nothing to fetch");
  return style.red(r.error?.code ?? "unknown");
}

function formatTapTotals(
  refreshed: number,
  skipped: number,
  failed: number,
  dryRun: boolean,
): string {
  const parts: string[] = [];
  if (refreshed > 0) parts.push(`${refreshed} ${dryRun ? "would be fetched" : "refreshed"}`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(plural(failed, "failure"));
  return parts.length === 0 ? "nothing changed" : parts.join(" · ");
}
