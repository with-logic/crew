/** Types shared by tap re-expansion passes (§10.1.1). */

import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";

/** One re-expansion outcome row. */
export interface TapReexpandRow {
  readonly name: string;
  readonly scope: Scope;
  readonly kind: "added" | "would_add" | "source_gone" | "tap_error";
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
  /** Vanished sources, keyed by full install identity (§11.1), never name alone. */
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}
