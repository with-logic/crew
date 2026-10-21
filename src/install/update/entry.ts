/**
 * Per-skill update logic for `crew update` (§10.1).
 *
 * Given one state entry, look up its tap, acquire it, and either:
 *   - report `up_to_date` if the resolved SHA / content hash hasn't moved;
 *   - report `skipped` if the entry is pinned and not forced;
 *   - re-stage and re-install if the SHA moved.
 *
 * Tap re-expansion (additions / source_gone) lives in `tap-reexpand/index.ts`;
 * this module handles only the per-existing-entry update.
 */

import { existsSync } from "node:fs";
import { cwdForEntry } from "../../agents/adapter.ts";
import type { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { type AcquiredTap, withAcquiredSkillPath } from "../../sources/acquire/index.ts";
import { isGistTap } from "../../sources/gist.ts";
import { hashSourceDirectory, isSourceDirectory } from "../../sources/read.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { upsertEntry } from "../../state/load.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import { hasExportCleanupFailure } from "../../util/export-cleanup.ts";
import { peekResolvedSha } from "./peek.ts";
import { groupRecordedTargets, reinstallIntoAgents } from "./reinstall.ts";
import { rowFor } from "./row.ts";
import { entryWithGistFilename } from "./source-path.ts";
import { rebuildStateEntry } from "./state.ts";
import type { InternalOutcome, UpdateRow } from "./types.ts";

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
): { row: UpdateRow; updatedState: StateFile; bumpHardFailure: boolean } {
  try {
    const selectedEntry = entryWithGistFilename(entry, config);
    const outcome = updateOne(selectedEntry, config, home, force, fallbackCwd, dryRun);
    const hardFailure =
      outcome.kind === "updated" && outcome.per_target.some((t) => t.kind === "failed");
    let next = state;
    // §10.1: advancing a shared revision requires completion without hard failures.
    if (
      outcome.kind === "updated" &&
      !hardFailure &&
      outcome.per_target.some((t) => t.kind === "installed" || t.kind === "up_to_date")
    ) {
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

function updateOne(
  entry: StateEntry,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
  dryRun: boolean,
): InternalOutcome {
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
  // §10.1 step 3c: re-resolve the entry's own ref. An entry installed at
  // a branch follows that branch (a branch is not pinned), and a forced
  // tag update installs the tag's current commit — neither is the
  // clone's `origin/HEAD`.
  //
  // Resolution happens before materialization: an up-to-date tap needs
  // only its SHA, and exporting a large tree just to discard it is the
  // common case on a routine `crew update`.
  // `--force` reinstalls a pinned entry even at an unchanged SHA, so it
  // still needs the bytes.
  const peeked = peekResolvedSha(tap, entry.ref, home);
  if (peeked !== null && peeked === entry.resolved_sha && !(force && entry.pinned)) {
    return { kind: "up_to_date" };
  }
  if (peeked !== null && entry.pinned && !force) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }
  // Only this entry's own directory or gist file is read and exported —
  // otherwise every entry sharing a whole-repo tap materializes the
  // whole repository again (§10.1).
  return withAcquiredSkillPath(tap, entry.ref, entry.source.path, home, (acquired, sourcePath) =>
    applyUpdate(entry, acquired, sourcePath, tap, home, force, entryCwd, dryRun),
  );
}

/** Stage and reinstall one entry from an already-acquired tree. */
function applyUpdate(
  entry: StateEntry,
  acquired: Pick<AcquiredTap, "resolvedSha" | "pinned">,
  sourcePath: string,
  tap: TapConfig,
  home: string,
  force: boolean,
  entryCwd: string,
  dryRun: boolean,
): InternalOutcome {
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  // §10.1: re-expansion handles removed children of tracked whole-tap installs;
  // individual path sources rely on this directory check.
  if (newSha === null && !isSourceDirectory(sourcePath)) return { kind: "source_gone" };
  const sourceHash = newSha === null ? hashSourceDirectory(sourcePath) : undefined;
  if (newSha === entry.resolved_sha && !(force && entry.pinned)) {
    if (newSha !== null) return { kind: "up_to_date" };
    if (sourceHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const loaded = loadSkill(sourcePath, isGistTap(tap));
  const targetGroups = groupRecordedTargets(entry, entryCwd);
  if (targetGroups.size === 0) return { kind: "skipped", reason: "no applicable agent targets" };
  if (dryRun) return { kind: "would_update", new_sha: newSha };
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home, sourceHash, isGistTap(tap));
  const perTarget = reinstallIntoAgents({
    entry,
    tap,
    storePath: staged.storePath,
    contentHash: staged.contentHash,
    newSha,
    force,
    entryCwd,
    targetGroups: targetGroups.values(),
  });
  return {
    kind: "updated",
    new_sha: newSha,
    content_hash: staged.contentHash,
    per_target: perTarget,
  };
}
