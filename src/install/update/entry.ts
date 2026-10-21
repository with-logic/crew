/**
 * Per-skill update logic for `crew update` (§10.1, §14).
 *
 * Given one state entry, look up its tap, acquire it, and either:
 *   - report `up_to_date` if the resolved SHA / content hash hasn't moved;
 *   - report `skipped` if the entry is pinned and not forced;
 *   - re-stage and re-install if the SHA moved.
 *
 * Tap re-expansion (additions / source_gone) lives in `tap-reexpand/index.ts`;
 * this module handles only the per-existing-entry update.
 */

import type { TargetBaseFailures } from "../../agents/target-lock/index.ts";
import type { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import type { PreparedSources } from "../../sources/acquire/revision.ts";
import { upsertEntry } from "../../state/load.ts";
import { hasExportCleanupFailure } from "../../util/export-cleanup.ts";
import { updateOne } from "./execute.ts";
import { rowFor } from "./row.ts";
import { entryWithGistFilename } from "./source-path.ts";
import { rebuildStateEntry } from "./state.ts";
import type { UpdateRow } from "./types.ts";

/** Preserve the input state on hard failure so every target can retry (§10.1).
 * `bumpHardFailure` reports that failure; successful target copies remain installed.
 */
export function updateOneEntry(
  entry: StateEntry,
  state: StateFile,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
  dryRun: boolean = false,
  baseFailures?: TargetBaseFailures,
  prepared?: PreparedSources,
): { row: UpdateRow; updatedState: StateFile; bumpHardFailure: boolean } {
  try {
    const selectedEntry = entryWithGistFilename(entry, config);
    const outcome = updateOne(
      selectedEntry,
      config,
      home,
      force,
      fallbackCwd,
      dryRun,
      baseFailures,
      prepared,
    );
    const hardFailure =
      outcome.kind === "updated" && outcome.per_target.some((t) => t.kind === "failed");
    let next = state;
    // §10.1: advancing a shared revision requires completion without hard failures.
    const hasCompletedTarget =
      outcome.kind === "updated" &&
      outcome.per_target.some((t) => t.kind === "installed" || t.kind === "up_to_date");
    const canAdvanceRevision = hasCompletedTarget && !hardFailure;
    if (canAdvanceRevision) {
      const nonFailedTargets = outcome.per_target.map((t) => t.agent);
      const newEntry = rebuildStateEntry(
        selectedEntry,
        outcome.new_sha,
        outcome.content_hash,
        nonFailedTargets,
      );
      next = upsertEntry(state, newEntry);
    }
    return {
      row: rowFor(entry, outcome),
      updatedState: next,
      bumpHardFailure: hardFailure,
    };
  } catch (err) {
    const ce = err as CrewError;
    const soft = ce.code === "no_skills_found" || ce.code === "invalid_ref";
    if (soft && !hasExportCleanupFailure(ce)) {
      return {
        row: rowFor(entry, { kind: "source_gone" }),
        updatedState: state,
        bumpHardFailure: false,
      };
    }
    // Anything that isn't a recognised soft outcome is a hard failure.
    // Listing the hard codes instead would exit 0 on any error this
    // module has not enumerated — including a raw `node:fs` error that
    // never reached a §13 code — reporting `failed` in the rows while
    // the run claims success (§10.1, C-UPD-09).
    return {
      row: rowFor(entry, {
        kind: "failed",
        error: { code: ce.code ?? "usage_error", message: ce.message },
      }),
      updatedState: state,
      bumpHardFailure: true,
    };
  }
}
