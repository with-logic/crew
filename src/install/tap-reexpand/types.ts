/** Types shared by tap re-expansion passes (§10.1.1). */

import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";
import type { FailureCode } from "../../util/errno.ts";

/** What every re-expansion row names. */
interface RowSubject {
  /** The skill's name — or, for a candidate whose name crew can't read, its location in the tap. */
  readonly name: string;
  readonly scope: Scope;
  readonly tap: string;
}

/** Why a child failed: a §13 name, or an agent folder's errno code (see `failureCodeOf`). */
export interface TapReexpandError {
  readonly code: FailureCode;
  readonly message: string;
}

/**
 * One re-expansion outcome row. A `tap_error` always carries its error
 * (C-UPD-18e: its code and message); no other kind has one.
 */
export type TapReexpandRow =
  | (RowSubject & { readonly kind: "added" | "would_add" | "source_gone"; readonly error?: never })
  | TapErrorRow;

/** A re-expansion row reporting a failure. */
export type TapErrorRow = RowSubject & {
  readonly kind: "tap_error";
  readonly error: TapReexpandError;
};

/** Narrows a row to a failure, for the renderers that list them. */
export function isTapErrorRow(row: TapReexpandRow): row is TapErrorRow {
  return row.kind === "tap_error";
}

/** Callback to install one newly-detected child skill. */
export type InstallNewChild = (args: {
  readonly skillPath: string;
  readonly skillName: string;
  readonly tapRelativePath: string;
  readonly scope: Scope;
  readonly tap: TapConfig;
  readonly agents: readonly string[];
  readonly resolvedSha: string | null;
  readonly projectRoot: string | null;
  readonly ref: string | null;
  readonly pinned: boolean;
}) => StateEntry | null;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly updated: readonly StateEntry[];
  readonly hardFailure: boolean;
  /** Vanished sources, keyed by full install identity (§11.1), never name alone. */
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}
