/**
 * Per-skill update logic for `crew update` (§10.1).
 *
 * Given one state entry, look up its tap, acquire it, and either:
 *   - report `up_to_date` if the resolved SHA / content hash hasn't moved;
 *   - report `skipped` if the entry is pinned and not forced;
 *   - re-stage and re-install if the SHA moved.
 *
 * With `dryRun` (§10.1.1) the SHA / content-hash comparison and skill
 * validation still run, but a moved entry reports `would_update` and
 * nothing is staged or installed.
 *
 * Tap re-expansion (additions / source_gone) lives in `tap-reexpand/index.ts`;
 * this module handles only the per-existing-entry update.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { cwdForEntry } from "../../agents/adapter.ts";
import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import { hashDirectory } from "../../hash/content.ts";
import { loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { upsertEntry } from "../../state/load.ts";
import { nowIso } from "../../util/time.ts";
import { reinstallIntoAgents } from "./reinstall.ts";
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
    const outcome = updateOne(entry, config, home, force, fallbackCwd, dryRun);
    let next = state;
    if (outcome.kind === "updated") {
      const successfulTargets = outcome.per_target
        .filter((t) => t.kind !== "failed")
        .map((t) => t.agent);
      const newEntry = rebuildStateEntry(
        entry,
        outcome.new_sha,
        outcome.content_hash,
        successfulTargets,
      );
      next = upsertEntry(state, newEntry);
    }
    return {
      row: rowFor(entry, outcome),
      updatedState: next,
      bumpHardFailure:
        outcome.kind === "updated" && outcome.per_target.some((t) => t.kind === "failed"),
    };
  } catch (err) {
    const ce = err as CrewError;
    const soft = ce.code === "no_skills_found" || ce.code === "invalid_ref";
    if (soft) {
      return {
        row: rowFor(entry, { kind: "source_gone" }),
        updatedState: state,
        bumpHardFailure: false,
      };
    }
    const hard = ["source_unreachable", "ref_not_found", "invalid_skill"].includes(ce.code);
    return {
      row: rowFor(entry, {
        kind: "failed",
        error: { code: ce.code ?? "usage_error", message: ce.message },
      }),
      updatedState: state,
      bumpHardFailure: hard,
    };
  }
}

/** Build an UpdateRow for a state entry, threading through project_root. */
function rowFor(entry: StateEntry, outcome: InternalOutcome): UpdateRow {
  const publicOutcome =
    outcome.kind === "updated"
      ? { kind: "updated" as const, new_sha: outcome.new_sha, per_target: outcome.per_target }
      : outcome;
  return {
    name: entry.name,
    scope: entry.scope,
    ...(entry.project_root === undefined ? {} : { project_root: entry.project_root }),
    outcome: publicOutcome,
  };
}

function updateOne(
  entry: StateEntry,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
  dryRun: boolean,
): InternalOutcome {
  const entryCwd = cwdForEntry(entry, fallbackCwd);
  if (entry.scope === "project" && entry.project_root && !existsSync(entry.project_root)) {
    return { kind: "missing_project_root", root: entry.project_root };
  }

  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  const tap = config.taps.find((t) => t.name === entry.source.tap);
  if (!tap) {
    // Tap was removed from config (manually); doctor --repair can fix.
    throw new CrewError(
      "source_unreachable",
      `tap \`${entry.source.tap}\` is no longer in config — run \`crew doctor --repair\` to rebuild it from markers`,
      { tap: entry.source.tap },
    );
  }
  const acquired = acquireTap(tap, home);
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  // Tap re-expansion has already marked missing children `source_gone`.
  const skillDir = join(acquired.rootDir, entry.source.path);

  // Path-kind tap (no SHA): hash the source once and reuse it both for
  // the up-to-date comparison and for the store's short id, rather than
  // walking the same unbounded tree twice. `hashDirectory` ignores a
  // root `.crew.json`, matching the store.
  const sourceHash = newSha === null ? hashDirectory(skillDir) : undefined;

  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    if (sourceHash === entry.content_hash) return { kind: "up_to_date" };
  }

  // Validation runs before the dry-run return on purpose: a broken
  // upstream version must surface as `failed` in a preview too, not be
  // reported as a clean `would_update`.
  const loaded = loadSkill(skillDir);
  if (dryRun) return { kind: "would_update", new_sha: newSha };
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home, sourceHash);
  const perTarget = reinstallIntoAgents({ entry, entryCwd, tap, staged, newSha, force });
  return {
    kind: "updated",
    new_sha: newSha,
    content_hash: staged.contentHash,
    per_target: perTarget,
  };
}

function rebuildStateEntry(
  entry: StateEntry,
  newSha: string | null,
  contentHash: string,
  successfulTargets: string[],
): StateEntry {
  return {
    ...entry,
    resolved_sha: newSha,
    content_hash: contentHash,
    agents: successfulTargets.length > 0 ? successfulTargets : entry.agents,
    installed_at: nowIso(),
  };
}
