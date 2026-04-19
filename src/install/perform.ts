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
 *   - maintains `explicit` and `required_by` on every entry per §11.1
 *     (explicit never demotes; required_by is rebuilt for every skill
 *     touched by this install);
 *   - returns a structured summary the CLI layer can format.
 *
 * Failures are per-pair: a failure in one (skill, target) does not stop
 * the rest. The summary decides the exit code.
 */

import type { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { ResolvedSkill, Scope, StateEntry, StateFile } from "../core/types.ts";
import type { RequiredByMap } from "../install/resolve.ts";
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
  options: {
    readonly force: boolean;
    readonly dryRun: boolean;
    readonly home?: string;
    readonly requiredBy: RequiredByMap;
  },
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
      state = upsertEntry(
        state,
        buildStateEntry(skill, scope, successfulTargets, state, options, cwd),
      );
    }
  }

  // Rebuild `required_by` across every touched skill (§11.1 invariant).
  // Any skill in the resolved set is authoritative for the current run;
  // other existing state entries are untouched.
  if (!options.dryRun) {
    state = rebuildRequiredBy(state, resolved, scope, options.requiredBy, cwd);
  }

  return { records, newState: state };
}

/**
 * Build the state entry for a freshly-installed skill. For project-scope
 * installs, `project_root` captures `cwd` — the directory the user ran
 * `crew install` from — so future update/uninstall/doctor operations
 * can find the install regardless of the user's cwd at that later time.
 */
function buildStateEntry(
  skill: ResolvedSkill,
  scope: Scope,
  successfulTargets: string[],
  state: StateFile,
  options: { readonly requiredBy: RequiredByMap },
  cwd: string,
): StateEntry {
  const incomingProjectRoot = scope === "project" ? cwd : null;
  const existing = state.installations.find(
    (e) =>
      e.name === skill.name &&
      e.scope === scope &&
      (e.project_root ?? null) === incomingProjectRoot,
  );
  // `explicit` never demotes: once a user explicitly wanted a skill,
  // we keep remembering (§11.1).
  const explicit = skill.explicit || (existing?.explicit ?? false);
  const required_by = [...(options.requiredBy.get(skill.name) ?? [])].sort();
  const base: StateEntry = {
    name: skill.name,
    source: skill.markerSource,
    ref: skill.ref,
    resolved_sha: skill.resolvedSha,
    content_hash: skill.contentHash,
    scope,
    installed_at: nowIso(),
    targets: successfulTargets,
    pinned: skill.pinned,
    explicit,
    required_by,
    ...(scope === "project" ? { project_root: cwd } : {}),
  };
  return skill.bundle ? { ...base, bundle: skill.bundle } : base;
}

/**
 * Rewrite `required_by` on every skill in the resolved set so that the
 * edges computed during resolution are reflected on disk. Entries not
 * in the resolved set are left alone (their `required_by` may still
 * reference resolved skills, but those edges are authoritative only
 * for skills the current command touched).
 */
function rebuildRequiredBy(
  state: StateFile,
  resolved: readonly ResolvedSkill[],
  scope: Scope,
  requiredBy: RequiredByMap,
  cwd: string,
): StateFile {
  const touched = new Set(resolved.map((s) => s.name));
  const incomingProjectRoot = scope === "project" ? cwd : null;
  return {
    schema_version: 1,
    installations: state.installations.map((e) => {
      if (e.scope !== scope || !touched.has(e.name)) return e;
      if ((e.project_root ?? null) !== incomingProjectRoot) return e;
      const required = [...(requiredBy.get(e.name) ?? [])].sort();
      return { ...e, required_by: required };
    }),
  };
}
