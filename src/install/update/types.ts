/**
 * Shared result types for `crew update` (§10.1).
 *
 * These are consumed by the command renderer and the per-skill update
 * implementation. The updater keeps extra internal metadata out of these
 * public row shapes so JSON output stays stable.
 */

export interface PerAgentUpdate {
  readonly agent: string;
  readonly kind: "installed" | "up_to_date" | "skipped" | "failed";
  readonly error?: { code: string; message: string };
  readonly reason?: string;
}

export type Outcome =
  | { kind: "up_to_date" }
  | { kind: "updated"; new_sha: string | null; per_target: PerAgentUpdate[] }
  | { kind: "skipped"; reason: string }
  | { kind: "source_gone" }
  | { kind: "missing_project_root"; root: string }
  | { kind: "failed"; error: { code: string; message: string } };

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
