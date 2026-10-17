/**
 * Per-skill update logic for `crew update` (§10.1).
 *
 * Given one state entry, look up its tap, acquire it, and either:
 *   - report `up_to_date` if the resolved SHA / content hash hasn't moved;
 *   - report `skipped` if the entry is pinned and not forced;
 *   - re-stage and re-install if the SHA moved (`./apply.ts`).
 *
 * Tap re-expansion (additions / source_gone) lives in `tap-reexpand/index.ts`;
 * this module handles only the per-existing-entry update.
 */

import { existsSync } from "node:fs";
import { cwdForEntry } from "../../agents/adapter.ts";
import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import { withAcquiredSkill } from "../../sources/acquire/one-skill.ts";
import { upsertEntry } from "../../state/load.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { crewErrorNameOf } from "../../util/errno.ts";
import { applyUpdate } from "./apply.ts";
import { peekResolvedSha } from "./peek.ts";
import { hasFailedTarget, rowFor } from "./public-row.ts";
import { rebuildStateEntry } from "./state.ts";
import type { InternalOutcome, UpdateRow } from "./types.ts";

export function updateOneEntry(
  entry: StateEntry,
  state: StateFile,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
  dryRun: boolean = false,
): { row: UpdateRow; updatedState: StateFile; bumpHardFailure: boolean } {
  try {
    const relocated = isRelocated(entry, state);
    const outcome = updateOne(entry, config, home, { force, fallbackCwd, dryRun, relocated });
    let next = state;
    const targetFailed = hasFailedTarget(outcome);
    // §10.1: a target crew couldn't write keeps its previous install, so
    // the entry stays as it was — its recorded path too — and the next
    // run tries again.
    if (outcome.kind === "updated" && !targetFailed) {
      const agents = outcome.per_target.map((t) => t.agent);
      const newEntry = rebuildStateEntry(entry, outcome.new_sha, outcome.content_hash, agents);
      next = upsertEntry(state, newEntry);
    }
    return {
      row: rowFor(entry, outcome),
      updatedState: next,
      bumpHardFailure: targetFailed,
    };
  } catch (err) {
    // A raw `node:fs` error can land here too (a file crew can't read
    // while hashing); its errno `.code` is no §13 name.
    const code = crewErrorNameOf(err, "usage_error");
    const soft = code === "no_skills_found" || code === "invalid_ref";
    if (soft) {
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
        error: { code, message: (err as Error).message },
      }),
      updatedState: state,
      bumpHardFailure: true,
    };
  }
}

/** How one entry's update runs. */
interface UpdateRun {
  readonly force: boolean;
  readonly fallbackCwd: string;
  readonly dryRun: boolean;
  /**
   * Re-expansion found the skill at a new path (§10.1, C-UPD-37): it is
   * reinstalled even with its content unchanged, so its marker's `path`
   * follows — never `up_to_date` while state and marker disagree.
   */
  readonly relocated: boolean;
}

/**
 * True when `entry`, as re-expansion read it back, sits at another path
 * than `state` records for the same install (§11.1: tap, name, scope,
 * project root). State keeps the recorded path until the update succeeds.
 */
function isRelocated(entry: StateEntry, state: StateFile): boolean {
  const recorded = state.installations.find(
    (e) =>
      e.source.tap === entry.source.tap &&
      e.name === entry.name &&
      e.scope === entry.scope &&
      (e.project_root ?? null) === (entry.project_root ?? null),
  );
  return recorded !== undefined && recorded.source.path !== entry.source.path;
}

function updateOne(
  entry: StateEntry,
  config: Config,
  home: string,
  run: UpdateRun,
): InternalOutcome {
  const { force, fallbackCwd, dryRun } = run;
  if (
    entry.scope === "project" &&
    !(hasUsableProjectRoot(entry) && existsSync(entry.project_root))
  ) {
    return { kind: "missing_project_root", root: String(entry.project_root ?? "(unknown)") };
  }

  const entryCwd = cwdForEntry(entry, fallbackCwd);
  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  const tap = config.taps.find((t) => t.name === entry.source.tap);
  if (!tap) {
    // Tap was removed from config (manually); doctor --repair can fix.
    return { kind: "tap_missing", tap: entry.source.tap };
  }
  // A forced pinned entry, or a relocated one, is reinstalled at an
  // unchanged commit or content.
  const reinstallAnyway = run.relocated || (force && entry.pinned);
  // §10.1 step 3c: re-resolve the entry's own ref. An entry installed at
  // a branch follows that branch (a branch is not pinned), and a forced
  // tag update installs the tag's current commit — neither is the
  // clone's `origin/HEAD`.
  //
  // Resolution happens before materialization: an up-to-date tap needs
  // only its SHA, and exporting a large tree just to discard it is the
  // common case on a routine `crew update`.
  const peeked = peekResolvedSha(tap, entry.ref, home);
  if (peeked !== null && peeked === entry.resolved_sha && !reinstallAnyway) {
    return { kind: "up_to_date" };
  }
  if (peeked !== null && entry.pinned && !force) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }
  // Only this entry's own subtree is read, so only it is exported —
  // otherwise every entry sharing a whole-repo tap materializes the
  // whole repository again (§10.1).
  return withAcquiredSkill(tap, entry.ref, entry.source.path, home, (acquired, skillPath) =>
    applyUpdate(entry, acquired, skillPath, tap, {
      home,
      force,
      entryCwd,
      dryRun,
      reinstallAnyway,
    }),
  );
}
