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
import { type AgentAdapter, baseFor, cwdForEntry } from "../../agents/adapter.ts";
import { installSkillIntoAgents } from "../../agents/install.ts";
import { agentByName } from "../../agents/registry.ts";
import { CrewError } from "../../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../../core/types.ts";
import { loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { upsertEntry } from "../../state/load.ts";
import { nowIso } from "../../util/time.ts";
import type { InternalOutcome, PerAgentUpdate, UpdateRow } from "./types.ts";

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
  const acquired = acquireTap(tap, home);
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  const skillDir = join(acquired.rootDir, entry.source.path);

  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    const tentative = stageIntoStore(skillDir, entry.name, null, home);
    if (tentative.contentHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const loaded = loadSkill(skillDir);
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home);
  const perTarget: PerAgentUpdate[] = [];
  // Group by resolved install path (§7.2 path sharing) so shared-path
  // targets install once but every adapter reports its own outcome.
  const groups = new Map<string, AgentAdapter[]>();
  for (const targetName of entry.agents) {
    const adapter = agentByName(targetName);
    if (!adapter) continue;
    const base = baseFor(adapter, entry.scope, entryCwd);
    if (base === "") continue;
    const dest = `${base}/${entry.name}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  for (const group of groups.values()) {
    try {
      const res = installSkillIntoAgents({
        agents: group,
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
      for (const a of group) {
        perTarget.push({
          agent: a.name,
          kind: res.kind === "installed" ? "installed" : "up_to_date",
        });
      }
    } catch (err) {
      const ce = err as CrewError;
      for (const a of group) {
        perTarget.push({ agent: a.name, kind: "skipped", reason: ce.code });
      }
    }
  }
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
