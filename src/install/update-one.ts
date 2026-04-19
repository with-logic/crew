/**
 * Per-skill update logic for `crew update` (§10.1).
 *
 * Given one state entry, re-resolve its source, decide whether the
 * install is up-to-date, pinned-and-untouched, customized, or due for
 * a reinstall, and in the last case run the install algorithm against
 * every currently-installed target.
 *
 * This module knows nothing about tap refresh, bundle re-expansion, or
 * the overall update run's exit-code aggregation — those live in
 * `commands/update.ts`.
 */

import { existsSync } from "node:fs";
import type { CrewError } from "../core/errors.ts";
import type { Config, StateEntry, StateFile } from "../core/types.ts";
import { acquireSource } from "../sources/acquire/index.ts";
import { expandSkills } from "../sources/expand.ts";
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
  | { kind: "updated"; new_sha: string; per_target: PerTargetUpdate[] }
  | { kind: "skipped"; reason: string }
  | { kind: "source_gone" }
  | { kind: "missing_project_root"; root: string }
  | { kind: "failed"; error: { code: string; message: string } };

export interface UpdateRow {
  readonly name: string;
  readonly scope: string;
  readonly outcome: Outcome;
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
    // §10.1 upstream-deletion rule: "source resolved but skill no
    // longer exists upstream" is a soft outcome. `acquireSource`
    // surfaces this case as `no_skills_found` (git subpath missing) or
    // `invalid_ref` (tap's named skill dir absent).
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
  // C-UPD-22: a project-scope entry whose recorded directory no longer
  // exists is skipped as `missing_project_root` — we preserve the
  // install and refuse to write anywhere else.
  const entryCwd = cwdForEntry(entry, fallbackCwd);
  if (entry.scope === "project" && entry.project_root && !existsSync(entry.project_root)) {
    return { kind: "missing_project_root", root: entry.project_root };
  }

  if (entry.pinned && entry.ref !== null && /^[0-9a-f]{40}$/i.test(entry.ref) && !force) {
    return { kind: "skipped", reason: "pinned to exact SHA" };
  }

  const source = reconstructSource(entry);
  const acquired = acquireSource(source, config, home);
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  if (newSha === entry.resolved_sha) {
    if (newSha !== null) return { kind: "up_to_date" };
    const tentative = stageIntoStore(acquired.rootDir, entry.name, null, home);
    if (tentative.contentHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const skills = expandSkills(acquired.rootDir);
  const skill = skills.find((s) => s.frontmatter.name === entry.name) ?? skills[0]!;
  const staged = stageIntoStore(skill.path, entry.name, newSha, home);
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
        markerSource: entry.source,
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
  return { kind: "updated", new_sha: newSha ?? entry.resolved_sha ?? "", per_target: perTarget };
}

function reconstructSource(entry: StateEntry) {
  switch (entry.source.type) {
    case "tap":
      return { type: "tap", tap: entry.source.tap, name: entry.name, ref: entry.ref } as const;
    case "git":
      return {
        type: "git",
        url: entry.source.url,
        ref: entry.ref,
        subpath: entry.source.subpath,
      } as const;
    case "path":
      return { type: "path", path: entry.source.path } as const;
  }
}

function rebuildStateEntry(
  entry: StateEntry,
  newSha: string,
  successfulTargets: string[],
): StateEntry {
  return {
    ...entry,
    resolved_sha: newSha,
    targets: successfulTargets.length > 0 ? successfulTargets : entry.targets,
    installed_at: nowIso(),
  };
}
