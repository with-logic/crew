/**
 * Shared result types for `crew update` (§10.1).
 *
 * These are consumed by the command renderer and the per-skill update
 * implementation. The updater keeps extra internal metadata out of these
 * public row shapes so JSON output stays stable.
 */

import type { CrewErrorName } from "../../core/errors.ts";
import type { FailureCode } from "../../util/errno.ts";

/** One agent's part of an `updated` row (§10.1). */
export type PerAgentUpdate =
  | { readonly agent: string; readonly kind: "installed" | "up_to_date" }
  /** A safety check refused it (§7.3); `reason` is its §13 name. */
  | { readonly agent: string; readonly kind: "skipped"; readonly reason: CrewErrorName }
  | {
      readonly agent: string;
      readonly kind: "failed";
      readonly error: { code: FailureCode; message: string };
    };

export type Outcome =
  | { kind: "up_to_date" }
  | { kind: "updated"; new_sha: string | null; per_target: PerAgentUpdate[] }
  /**
   * `--dry-run` preview of an `updated` outcome (§10.1.1). For a
   * git-kind tap the clone was refreshed to learn this; a path-kind tap
   * has no clone and is compared by content hash. Either way no
   * installed skill, marker, store entry, or `state.json` was written.
   */
  | { kind: "would_update"; new_sha: string | null }
  | { kind: "skipped"; reason: string }
  | { kind: "source_gone" }
  /** §10.1: the entry's tap is no longer in config. Soft; install is kept. */
  | { kind: "tap_missing"; tap: string }
  | { kind: "missing_project_root"; root: string }
  | { kind: "failed"; error: { code: CrewErrorName; message: string } };

/** True when an `updated` outcome has a target crew couldn't write (§10.1). */
export function hasFailedTarget(o: Outcome): boolean {
  return o.kind === "updated" && o.per_target.some((t) => t.kind === "failed");
}

export interface UpdateRow {
  readonly name: string;
  readonly scope: string;
  /** For project-scope entries, the directory the skill is installed under. */
  readonly project_root?: string;
  readonly outcome: Outcome;
  /** Top-level names whose dep closure pulled this entry in (when `crew update <name>...`). */
  readonly transitively_required_by?: readonly string[];
}

type UpdatedOutcome = Extract<Outcome, { kind: "updated" }>;

type NonUpdatedOutcome = Exclude<Outcome, UpdatedOutcome>;

export type InternalOutcome =
  | NonUpdatedOutcome
  | (UpdatedOutcome & { readonly content_hash: string });
