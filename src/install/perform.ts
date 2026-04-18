/**
 * Install every resolved skill into every active target (§9 steps 9–10).
 *
 * Given a resolved, topologically-ordered install set and the active
 * targets, this function:
 *
 *   - runs the per-target install algorithm (§7.3);
 *   - records per-target outcomes;
 *   - updates `state.json` via upsert under the state lock held by the
 *     caller;
 *   - returns a structured summary the CLI layer can format.
 *
 * Failures are per-pair: a failure in one (skill, target) does not stop
 * the rest. The summary decides the exit code.
 */

import type { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { ResolvedSkill, Scope, StateFile } from "../core/types.ts";
import { upsertEntry } from "../state/load.ts";
import type { TargetAdapter } from "../targets/adapter.ts";
import { type InstallOutcome, installSkillIntoTarget } from "../targets/install.ts";
import { nowIso } from "../util/time.ts";

/** Per-(skill, target) outcome. */
export type PerTargetResult =
  | { kind: "installed"; target: string }
  | { kind: "up_to_date"; target: string }
  | { kind: "failed"; target: string; error: { code: string; message: string } };

/** Per-skill install record. */
export interface InstallRecord {
  readonly name: string;
  readonly scope: Scope;
  readonly targets: readonly PerTargetResult[];
  /** True iff the skill succeeded in at least one target (or was up-to-date). */
  readonly anySuccess: boolean;
}

/** Result of the whole install operation. */
export interface InstallSummary {
  readonly records: readonly InstallRecord[];
  readonly newState: StateFile;
}

/** Install every resolved skill into every active target. */
export function performInstall(
  resolved: readonly ResolvedSkill[],
  targets: readonly TargetAdapter[],
  scope: Scope,
  cwd: string,
  startingState: StateFile,
  options: { readonly force: boolean; readonly dryRun: boolean; readonly home?: string },
): InstallSummary {
  const home = options.home ?? crewHome();
  void home;
  const records: InstallRecord[] = [];
  let state = startingState;

  for (const skill of resolved) {
    const perTarget: PerTargetResult[] = [];
    const successfulTargets: string[] = [];
    for (const adapter of targets) {
      try {
        if (options.dryRun) {
          perTarget.push({ kind: "installed", target: adapter.name });
          successfulTargets.push(adapter.name);
          continue;
        }
        const outcome: InstallOutcome = installSkillIntoTarget({
          adapter,
          scope,
          cwd,
          storePath: skill.storePath,
          skillName: skill.name,
          markerSource: skill.markerSource,
          ref: skill.ref,
          resolvedSha: skill.resolvedSha,
          contentHash: skill.contentHash,
          force: options.force,
        });
        perTarget.push({
          kind: outcome.kind === "installed" ? "installed" : "up_to_date",
          target: adapter.name,
        });
        successfulTargets.push(adapter.name);
      } catch (err) {
        const ce = err as CrewError;
        perTarget.push({
          kind: "failed",
          target: adapter.name,
          error: { code: ce.code ?? "usage_error", message: ce.message },
        });
      }
    }
    const anySuccess = successfulTargets.length > 0;
    records.push({ name: skill.name, scope, targets: perTarget, anySuccess });
    if (!options.dryRun && anySuccess) {
      state = upsertEntry(state, {
        name: skill.name,
        source: skill.markerSource,
        ref: skill.ref,
        resolved_sha: skill.resolvedSha,
        content_hash: skill.contentHash,
        scope,
        installed_at: nowIso(),
        targets: successfulTargets,
        pinned: skill.pinned,
      });
    }
  }

  return { records, newState: state };
}
