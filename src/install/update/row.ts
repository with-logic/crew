/**
 * One `crew update` row (§10.1): the public shape of a skill's outcome,
 * and the §13 name a failed one reports.
 */

import { CrewError, type CrewErrorName } from "../../core/errors.ts";
import type { StateEntry } from "../../core/types.ts";
import { isFsError } from "../../util/errno.ts";
import type { InternalOutcome, UpdateRow } from "./types.ts";

/**
 * The §13 name a failed update reports. A raw `node:fs` error can land
 * here too (a file crew can't read while hashing or staging); its errno
 * `.code` is no §13 name, and a local file crew can't read is
 * `source_unreachable` (§13).
 */
export function updateErrorCode(err: unknown): CrewErrorName {
  if (err instanceof CrewError) return err.code;
  return isFsError(err) ? "source_unreachable" : "usage_error";
}

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
