/**
 * One `crew update` row as `--json` shows it (§10.1): internal outcome
 * metadata stays out of the public shape.
 */

import type { StateEntry } from "../../core/types.ts";
import type { InternalOutcome, Outcome, UpdateRow } from "./types.ts";

/** Build an UpdateRow for a state entry, threading through project_root. */
export function rowFor(entry: StateEntry, outcome: InternalOutcome): UpdateRow {
  const publicOutcome =
    outcome.kind === "updated"
      ? { kind: "updated" as const, new_sha: outcome.new_sha, per_target: outcome.per_target }
      : outcome;
  return {
    name: entry.name,
    scope: entry.scope,
    ...(entry.project_root === undefined
      ? {}
      : { project_root: String(entry.project_root ?? "(unknown)") }),
    outcome: publicOutcome,
  };
}

/** True when an `updated` outcome has a target crew couldn't write (§10.1). */
export function hasFailedTarget(o: Outcome): boolean {
  return o.kind === "updated" && o.per_target.some((t) => t.kind === "failed");
}
