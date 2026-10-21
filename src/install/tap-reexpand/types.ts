/** Types shared by tap re-expansion passes (§10.1.1). */

import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";

/** Per-target results of a new child transaction (§10.1.1). */
export type NewChildTargetResult =
  | { readonly agent: string; readonly kind: "installed" | "up_to_date" | "rolled_back" }
  | {
      readonly agent: string;
      readonly kind: "failed";
      readonly error: { readonly code: string; readonly message: string };
    };

export interface NewChildInstallResult {
  readonly entry: StateEntry | null;
  readonly perTarget: readonly NewChildTargetResult[];
}

/** One re-expansion outcome row. */
export interface TapReexpandRow {
  readonly name: string;
  readonly scope: Scope;
  readonly kind: "added" | "would_add" | "source_gone" | "tap_error";
  readonly tap: string;
  readonly error?: { readonly code: string; readonly message: string };
  readonly per_target?: readonly NewChildTargetResult[];
}

/** Callback to install one newly-detected child skill. */
export type InstallNewChild = (args: {
  readonly skillDir: string;
  readonly skillName: string;
  readonly tapRelativePath: string;
  readonly scope: Scope;
  readonly tap: TapConfig;
  readonly agents: readonly string[];
  readonly resolvedSha: string | null;
  readonly projectRoot: string | null;
  readonly ref: string | null;
  readonly pinned: boolean;
}) => NewChildInstallResult;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly updated: readonly StateEntry[];
  readonly hardFailure: boolean;
  /** Vanished sources, keyed by full install identity (§11.1), never name alone. */
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}
