/**
 * Per-row formatting for `crew update`'s human output (§10.1).
 *
 * One outcome kind per branch: the status word, the dim detail beside
 * it, and the leading symbol. Split out of `./render.ts` to keep both
 * files under the 200-line cap.
 */

import type { UpdateRow } from "../../install/update/types.ts";
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
    const shortSha = o.new_sha ? o.new_sha.slice(0, 8) : "local";
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
  if (o.kind === "tap_missing") {
    return {
      status: style.yellow("tap removed"),
      detail: style.dim(`keeping your copy; re-add \`${o.tap}\` or run \`crew doctor --repair\``),
      required,
    };
  }
  return {
    status: style.red("failed"),
    detail: style.red(o.error.code.replace(/_/g, " ")),
    required,
  };
}

export function symbolFor(row: UpdateRow, style: Styler): string {
  const o = row.outcome;
  if (o.kind === "updated") return style.symbol("ok");
  if (o.kind === "up_to_date") return style.symbol("muted");
  if (o.kind === "skipped" || o.kind === "missing_project_root") return style.symbol("muted");
  if (o.kind === "source_gone" || o.kind === "tap_missing") return style.symbol("warn");
  return style.symbol("fail");
}
