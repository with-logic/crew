/** Types shared by tap re-expansion passes (§10.1.1). */

import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";

/** One re-expansion outcome row. */
interface TapReexpandRowBase {
  readonly name: string;
  readonly scope: Scope;
  /** §10.1.1: present only for the originating project install. */
  readonly project_root?: string;
  readonly tap: string;
}

/** Only successful additions expose non-fatal rollback cleanup diagnostics. */
export type TapReexpandRow = TapReexpandRowBase &
  (
    | { readonly kind: "added"; readonly warnings?: readonly string[]; readonly error?: never }
    | { readonly kind: "would_add" | "source_gone"; readonly error?: never }
    | {
        readonly kind: "tap_error";
        readonly error: { readonly code: string; readonly message: string };
      }
  );

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
  /** Cleanup diagnostics on success; failed additions append these to their error. */
  readonly onWarning?: (warning: string) => void;
}) => StateEntry | null;

export interface TapReexpandResult {
  readonly added: readonly StateEntry[];
  readonly updated: readonly StateEntry[];
  readonly hardFailure: boolean;
  /** Vanished sources, keyed by full install identity (§11.1), never name alone. */
  readonly sourceGone: ReadonlySet<string>;
  readonly rows: readonly TapReexpandRow[];
}
