/**
 * Per-row formatting for `crew update` human output (§10.1).
 *
 * Maps each `UpdateRow` outcome to a status word, a detail cell, and a
 * leading symbol, and builds the two cells both `crew update` and
 * `crew outdated` render identically: the name cell (with its project
 * location) and additions grouped by tap. Kept separate from the two
 * `render.ts` files, which own their own layout (headers, totals,
 * closing lines) and differ deliberately.
 */

import type { TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import type { TapErrorRow } from "../../install/tap-reexpand/types.ts";
import { hasFailedTarget } from "../../install/update/public-row.ts";
import type { Outcome, UpdateRow } from "../../install/update/types.ts";
import { displayText } from "../../refs/display-url.ts";
import { plural, shortenHome } from "../../util/format.ts";
import { sanitizeLine } from "../../util/redact.ts";
import type { Styler } from "../../util/term.ts";

export interface RowParts {
  readonly status: string;
  readonly detail: string;
  readonly required: string;
}

export function formatRowParts(row: UpdateRow, style: Styler): RowParts {
  const o = row.outcome;
  const required =
    row.transitively_required_by && row.transitively_required_by.length > 0
      ? style.dim(`(required by ${row.transitively_required_by.join(", ")})`)
      : "";

  if (o.kind === "up_to_date") {
    return { status: style.dim("up to date"), detail: "", required };
  }
  if (o.kind === "updated") {
    if (hasFailedTarget(o)) {
      const labels = failedTargetLabels(o).join(", ");
      return { status: style.red("failed"), detail: style.red(labels), required };
    }
    return { status: style.green("updated"), detail: style.cyan(shortSha(o.new_sha)), required };
  }
  if (o.kind === "would_update") {
    return {
      status: style.green("would update"),
      detail: style.cyan(shortSha(o.new_sha)),
      required,
    };
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
  if (o.kind === "tap_missing") {
    return {
      status: style.yellow("tap removed"),
      detail: style.dim(`keeping your copy; re-add \`${o.tap}\` or run \`crew doctor --repair\``),
      required,
    };
  }
  // `failed` is the only remaining variant. `satisfies` makes a newly
  // added `Outcome` kind a compile error here instead of silently
  // rendering as a failure, and costs no unreachable runtime line
  // (CLAUDE.md's coverage rule).
  o satisfies Extract<Outcome, { kind: "failed" }>;
  return {
    status: style.red("failed"),
    detail: style.red(o.error.code.replace(/_/g, " ")),
    required,
  };
}

export function symbolFor(row: UpdateRow, style: Styler): string {
  const o = row.outcome;
  if (hasFailedTarget(o)) return style.symbol("fail");
  if (o.kind === "updated" || o.kind === "would_update") return style.symbol("ok");
  if (o.kind === "up_to_date") return style.symbol("muted");
  if (o.kind === "skipped" || o.kind === "missing_project_root") return style.symbol("muted");
  if (o.kind === "source_gone" || o.kind === "tap_missing") return style.symbol("warn");
  // Only `failed` remains. `satisfies` makes a newly-added `Outcome`
  // kind a compile error here instead of silently taking the fail
  // symbol, and costs no unreachable runtime line.
  o satisfies Extract<Outcome, { kind: "failed" }>;
  return style.symbol("fail");
}

/**
 * The agents an `updated` row couldn't write, as `agent: CODE` — the run
 * exits 1 for them (§10.1), so the row reads as a failure.
 */
function failedTargetLabels(o: Extract<Outcome, { kind: "updated" }>): string[] {
  const out: string[] = [];
  for (const t of o.per_target) if (t.kind === "failed") out.push(`${t.agent}: ${t.error.code}`);
  return out;
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 8) : "local";
}

/**
 * The name cell for a row: symbol, skill name, and — for a project
 * install — where it lives. Shared so the two renderers can't drift on
 * how a project-scoped row identifies itself.
 */
export function nameCell(row: UpdateRow, style: Styler): string {
  const base = `  ${symbolFor(row, style)} ${style.bold(row.name)}`;
  if (row.scope !== "project" || typeof row.project_root !== "string" || !row.project_root)
    return base;
  return `${base} ${style.dim(`(in ${shortenHome(row.project_root)})`)}`;
}

/**
 * The human lines for re-expansion failures, and how many failures they
 * count as: each failed child on its own, and each distinct failure of a
 * group as a whole (`whole_group`) once — one fault, not one per skill
 * (§10.1.1 step 1). Groups of one tap that failed the same way are one
 * fault; ones that failed differently are each shown and counted.
 */
export function tapErrorBlocks(
  rows: readonly TapErrorRow[],
  symbol: string,
  style: Styler,
): { lines: string[]; failures: number } {
  const lines: string[] = [];
  const faults = new Map<string, { row: TapErrorRow; skills: Set<string> }>();
  let children = 0;
  for (const row of rows) {
    if (!row.whole_group) {
      children++;
      lines.push(...tapErrorLines(row, symbol, style));
      continue;
    }
    const key = JSON.stringify([row.tap, row.error.code, row.error.message]);
    const fault = faults.get(key) ?? { row, skills: new Set<string>() };
    fault.skills.add(row.name);
    faults.set(key, fault);
  }
  for (const { row, skills } of faults.values()) {
    const tap = style.bold(sanitizeLine(row.tap));
    const count = style.dim(`(${plural(skills.size, "skill")})`);
    lines.push(`${symbol} couldn't re-expand tap ${tap} ${count} ${style.red(row.error.code)}`);
    lines.push(...detailLines(row, style));
  }
  return { lines, failures: children + faults.size };
}

/**
 * A failed new child's lines: its name, tap, and code; then why, and the
 * next step when there is one. All are escaped (§5.2): an unnamed
 * candidate's row is named by a folder a repository's author chose, and
 * its message may carry a raw filesystem error, so none may move the
 * cursor or forge a line.
 */
function tapErrorLines(row: TapErrorRow, symbol: string, style: Styler): string[] {
  const name = style.bold(sanitizeLine(row.name));
  return [
    `${symbol} ${name} ${style.dim(`(from ${sanitizeLine(row.tap)})`)} ${style.red(row.error.code)}`,
    ...detailLines(row, style),
  ];
}

/** Why `row` failed, and what to do, each on its own escaped line. */
function detailLines(row: TapErrorRow, style: Styler): string[] {
  const lines = [style.dim(`  ${sanitizeLine(displayText(row.error.message))}`)];
  if (row.error.remedy) lines.push(style.dim(`  ${sanitizeLine(row.error.remedy)}`));
  return lines;
}

/** Group re-expansion rows by tap name, preserving encounter order. */
export function groupByTap(rows: readonly TapReexpandRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const names = out.get(r.tap);
    if (names) names.push(r.name);
    else out.set(r.tap, [r.name]);
  }
  return out;
}
