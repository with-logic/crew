/**
 * Per-row formatting for `crew update` human output (§10.1).
 *
 * Maps each `UpdateRow` outcome to a status word, a detail cell, and a
 * leading symbol. Kept separate from `render.ts`, which owns layout
 * (header, tap sections, totals).
 */

import type { Outcome, UpdateRow } from "../../install/update/types.ts";
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
  if (o.kind === "updated" || o.kind === "would_update") return style.symbol("ok");
  if (o.kind === "up_to_date") return style.symbol("muted");
  if (o.kind === "skipped" || o.kind === "missing_project_root") return style.symbol("muted");
  if (o.kind === "source_gone") return style.symbol("warn");
  // Only `failed` remains. `satisfies` makes a newly-added `Outcome`
  // kind a compile error here instead of silently taking the fail
  // symbol, and costs no unreachable runtime line.
  o satisfies Extract<Outcome, { kind: "failed" }>;
  return style.symbol("fail");
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 8) : "local";
}
