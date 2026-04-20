/**
 * Per-skill update logic for `crew update` (§10.1).
 *
 * Given one state entry, look up its tap, acquire it, and either:
 *   - report `up_to_date` if the resolved SHA / content hash hasn't moved;
 *   - report `skipped` if the entry is pinned and not forced;
 *   - re-stage and re-install if the SHA moved.
 *
 * Tap re-expansion (additions / source_gone) lives in `tap-reexpand.ts`;
 * this module handles only the per-existing-entry update.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../core/types.ts";
import { loadSkill } from "../skill/load.ts";
import { acquireTap } from "../sources/acquire/index.ts";
import { stageIntoStore } from "../sources/store.ts";
import { upsertEntry } from "../state/load.ts";
import { cwdForEntry } from "../targets/adapter.ts";
import { installSkillIntoTarget } from "../targets/install.ts";
import { adapterByName } from "../targets/registry.ts";
import { nowIso } from "../util/time.ts";

export interface PerTargetUpdate {
  readonly target: string;
  readonly kind: "installed" | "up_to_date" | "skipped" | "failed";
  readonly error?: { code: string; message: string };
  readonly reason?: string;
}

export type Outcome =
  | { kind: "up_to_date" }
  | { kind: "updated"; new_sha: string | null; per_target: PerTargetUpdate[] }
  | { kind: "skipped"; reason: string }
  | { kind: "source_gone" }
  | { kind: "missing_project_root"; root: string }
  | { kind: "failed"; error: { code: string; message: string } };

export interface UpdateRow {
  readonly name: string;
  readonly scope: string;
  readonly outcome: Outcome;
  /** Top-level names whose dep closure pulled this entry in (when `crew update <name>...`). */
  readonly transitively_required_by?: readonly string[];
}

/** Per-entry update: returns a row, the new state, and whether to bump hardFailure. */
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
        .map((t) => t.target);
      const newEntry = rebuildStateEntry(entry, outcome.new_sha, successfulTargets);
      next = upsertEntry(state, newEntry);
    }
    return {
      row: { name: entry.name, scope: entry.scope, outcome },
      updatedState: next,
      bumpHardFailure:
        outcome.kind === "updated" && outcome.per_target.some((t) => t.kind === "failed"),
    };
  } catch (err) {
    const ce = err as CrewError;
    const soft = ce.code === "no_skills_found" || ce.code === "invalid_ref";
    if (soft) {
      return {
        row: { name: entry.name, scope: entry.scope, outcome: { kind: "source_gone" } },
        updatedState: state,
        bumpHardFailure: false,
      };
    }
    const hard = ["source_unreachable", "ref_not_found", "invalid_skill"].includes(ce.code);
    return {
      row: {
        name: entry.name,
        scope: entry.scope,
        outcome: {
          kind: "failed",
          error: { code: ce.code ?? "usage_error", message: ce.message },
        },
      },
      updatedState: state,
      bumpHardFailure: hard,
    };
  }
}

function updateOne(
  entry: StateEntry,
  config: Config,
  home: string,
  force: boolean,
  fallbackCwd: string,
): Outcome {
  const entryCwd = cwdForEntry(entry, fallbackCwd);
  if (entry.scope === "project" && entry.project_root && !existsSync(entry.project_root)) {
    return { kind: "missing_project_root", root: entry.project_root };
  }

  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  // Look up the tap that owns this entry.
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

  // Resolve the skill's directory inside the tap. Tap re-expansion
  // runs before the per-entry loop and already marks missing skills
  // as `source_gone`, so by the time we're here the dir is guaranteed
  // to exist.
  const skillDir = join(acquired.rootDir, entry.source.path);

  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    const tentative = stageIntoStore(skillDir, entry.name, null, home);
    if (tentative.contentHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const loaded = loadSkill(skillDir);
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home);
  const perTarget: PerTargetUpdate[] = [];
  for (const targetName of entry.targets) {
    const adapter = adapterByName(targetName);
    if (!adapter) continue;
    try {
      const res = installSkillIntoTarget({
        adapter,
        scope: entry.scope,
        cwd: entryCwd,
        storePath: staged.storePath,
        skillName: entry.name,
        tap,
        tapRelativePath: entry.source.path,
        ref: entry.ref,
        resolvedSha: newSha,
        contentHash: staged.contentHash,
        force,
      });
      perTarget.push({
        target: targetName,
        kind: res.kind === "installed" ? "installed" : "up_to_date",
      });
    } catch (err) {
      const ce = err as CrewError;
      perTarget.push({ target: targetName, kind: "skipped", reason: ce.code });
    }
  }
  return { kind: "updated", new_sha: newSha, per_target: perTarget };
}

function rebuildStateEntry(
  entry: StateEntry,
  newSha: string | null,
  successfulTargets: string[],
): StateEntry {
  return {
    ...entry,
    resolved_sha: newSha,
    targets: successfulTargets.length > 0 ? successfulTargets : entry.targets,
    installed_at: nowIso(),
  };
}
