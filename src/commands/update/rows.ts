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

import type { Scope } from "../../core/types.ts";
import type { TapReexpandRow } from "../../install/tap-reexpand/index.ts";
import type { Outcome, UpdateRow } from "../../install/update/types.ts";
import { displayText } from "../../refs/display-url.ts";
import { shortenHome } from "../../util/format.ts";
import { sanitizeLine } from "../../util/redact.ts";
import type { Styler, SymbolKind } from "../../util/term.ts";
import { targetIssues, updatedRowStatus } from "./targets.ts";

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
    const status = updatedRowStatus(o);
    const color = {
      failed: style.red,
      skipped: style.dim,
      "partially updated": style.yellow,
      updated: style.green,
    }[status];
    const details = targetIssues(o);
    if (status === "updated" || status === "partially updated") {
      details.unshift(style.cyan(shortSha(o.new_sha)));
    }
    return { status: color(status), detail: details.join("; "), required };
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
    detail: style.red(
      sanitizeLine(displayText(`${o.error.code.replace(/_/g, " ")}: ${o.error.message}`)),
    ),
    required,
  };
}

export function symbolFor(row: UpdateRow, style: Styler): string {
  const o = row.outcome;
  if (o.kind === "updated") {
    const symbols = {
      updated: "ok",
      "partially updated": "warn",
      failed: "fail",
      skipped: "muted",
    } satisfies Record<ReturnType<typeof updatedRowStatus>, SymbolKind>;
    return style.symbol(symbols[updatedRowStatus(o)]);
  }
  if (o.kind === "would_update") return style.symbol("ok");
  if (o.kind === "up_to_date") return style.symbol("muted");
  if (o.kind === "skipped" || o.kind === "missing_project_root") return style.symbol("muted");
  if (o.kind === "source_gone" || o.kind === "tap_missing") return style.symbol("warn");
  // Only `failed` remains. `satisfies` makes a newly-added `Outcome`
  // kind a compile error here instead of silently taking the fail
  // symbol, and costs no unreachable runtime line.
  o satisfies Extract<Outcome, { kind: "failed" }>;
  return style.symbol("fail");
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

interface TapAdditionGroup {
  readonly tap: string;
  readonly scope: Scope;
  readonly project_root?: string;
  readonly names: readonly string[];
}

/** Keep independent install locations separate, preserving encounter order (§10.1.1). */
export function groupAdditions(rows: readonly TapReexpandRow[]): readonly TapAdditionGroup[] {
  const out = new Map<string, Omit<TapAdditionGroup, "names"> & { names: string[] }>();
  for (const r of rows) {
    const key = JSON.stringify([r.tap, r.scope, r.project_root ?? null]);
    const group = out.get(key);
    if (group) group.names.push(r.name);
    else
      out.set(key, {
        tap: r.tap,
        scope: r.scope,
        ...(r.project_root === undefined ? {} : { project_root: r.project_root }),
        names: [r.name],
      });
  }
  return [...out.values()];
}
