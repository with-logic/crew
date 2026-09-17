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
import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile, TapConfig } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { type AcquiredTap, withAcquiredSkillDir } from "../../sources/acquire/index.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { upsertEntry } from "../../state/load.ts";
import { nowIso } from "../../util/time.ts";
import { peekResolvedSha } from "./peek.ts";
import { reinstallIntoAgents } from "./reinstall.ts";
import type { InternalOutcome, UpdateRow } from "./types.ts";

export function updateOneEntry(
  entry: StateEntry,
  state: StateFile,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
): { row: UpdateRow; updatedState: StateFile; bumpHardFailure: boolean } {
  try {
    const outcome = updateOne(entry, config, home, force, fallbackCwd);
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
  // Only this entry's own subtree is read, so only it is exported —
  // otherwise every entry sharing a whole-repo tap materializes the
  // whole repository again (§10.1).
  return withAcquiredSkillDir(tap, entry.ref, entry.source.path, home, (acquired, skillDir) =>
    applyUpdate(entry, acquired, skillDir, tap, home, force, entryCwd),
  );
}

/** Stage and reinstall one entry from an already-acquired tree. */
function applyUpdate(
  entry: StateEntry,
  acquired: AcquiredTap,
  // Tap re-expansion has already marked missing children `source_gone`.
  skillDir: string,
  tap: TapConfig,
  home: string,
  force: boolean,
  entryCwd: string,
): InternalOutcome {
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    const tentative = stageIntoStore(skillDir, entry.name, null, home);
    if (tentative.contentHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const loaded = loadSkill(skillDir);
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home);
  const perTarget = reinstallIntoAgents({
    entry,
    tap,
    storePath: staged.storePath,
    contentHash: staged.contentHash,
    newSha,
    force,
    entryCwd,
  });
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
