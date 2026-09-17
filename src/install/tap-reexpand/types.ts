/**
 * Shared types for tap re-expansion (§10.1.1).
 *
 * Split out so the orchestration in `./index.ts` and the per-group walk
 * in `./group.ts` can both reach them without either importing the other.
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
  /** The ref the group tracks, and whether it is immutable (§11.1). */
  readonly ref: string | null;
  readonly pinned: boolean;
}) => StateEntry | null;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly updated: readonly StateEntry[];
  readonly hardFailure: boolean;
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}

/** Mutable accumulator threaded through the per-group walk. */
export interface ReexpandAccumulator {
  readonly added: StateEntry[];
  readonly updated: StateEntry[];
  readonly sourceGone: Set<string>;
  readonly rows: TapReexpandRow[];
  hardFailure: boolean;
}
