/**
 * Shared types for tap re-expansion (§10.1.1).
 *
 * Split from the algorithm so the per-group passes in `group.ts` and the
 * driver in `index.ts` can both name them without a cycle.
 */

import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";

/** One re-expansion outcome row. */
export interface TapReexpandRow {
  readonly name: string;
  readonly scope: Scope;
  readonly kind: "added" | "source_gone" | "tap_error";
  readonly tap: string;
  readonly error?: { readonly code: string; readonly message: string };
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
}) => StateEntry | null;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly updated: readonly StateEntry[];
  readonly hardFailure: boolean;
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}

/** Mutable accumulators threaded through the per-group passes. */
export interface ReexpandSink {
  readonly added: StateEntry[];
  readonly updated: StateEntry[];
  readonly sourceGone: Set<string>;
  readonly rows: TapReexpandRow[];
}
