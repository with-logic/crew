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
    /**
     * The full resolve set (including skills that were already
     * installed and thus skipped during the per-target loop). Used to
     * maintain `required_by` edges on already-installed shared deps —
     * e.g. installing `b` when `a` and `b` both depend on `shared`.
     * Defaults to `resolved` when absent.
     */
    readonly allResolved?: readonly ResolvedSkill[];
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
          tap: skill.tap,
          tapRelativePath: skill.tapRelativePath,
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

  // Rebuild `required_by` across every skill in the resolve set (both
  // the ones we just installed and any that were already-installed
  // shared deps). Skills outside the resolve set are untouched.
  if (!options.dryRun) {
    const forEdges = options.allResolved ?? resolved;
    state = rebuildRequiredBy(state, forEdges, scope, options.requiredBy, cwd);
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
  return {
    name: skill.name,
    source: { tap: skill.tap.name, path: skill.tapRelativePath },
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
}

/**
 * Rewrite `required_by` on every skill in the resolved set so that the
 * edges computed during resolution are reflected on disk.
 *
 * This install's roots (the explicit skills named by the user) are
 * authoritative over edges from themselves: if `foo` was a root and
 * `foo` previously claimed `bar` as a dep but no longer does, we drop
 * that edge. Other skills' edges are preserved, so that two independent
 * installs that share a common dep both end up in the dep's
 * `required_by` list (avoids a shared dep getting mis-pruned later).
 */
function rebuildRequiredBy(
  state: StateFile,
  resolved: readonly ResolvedSkill[],
  scope: Scope,
  requiredBy: RequiredByMap,
  cwd: string,
): StateFile {
  const touched = new Set(resolved.map((s) => s.name));
  // The roots of this install (skills the user named directly, plus
  // every skill of a multi-skill tap install per §9 step 5). Any existing
  // `required_by` edge FROM one of these roots is considered stale and
  // replaced with this install's freshly-resolved edges.
  const roots = new Set(resolved.filter((s) => s.explicit).map((s) => s.name));
  const incomingProjectRoot = scope === "project" ? cwd : null;
  return {
    schema_version: 1,
    installations: state.installations.map((e) => {
      if (e.scope !== scope || !touched.has(e.name)) return e;
      if ((e.project_root ?? null) !== incomingProjectRoot) return e;
      // Start from existing edges minus any that came from this
      // install's roots (stale-edge removal). Then layer the fresh
      // edges on top.
      const preserved = e.required_by.filter((n) => !roots.has(n));
      const fresh = requiredBy.get(e.name) ?? new Set<string>();
      const merged = new Set<string>(preserved);
      for (const r of fresh) merged.add(r);
      return { ...e, required_by: [...merged].sort() };
    }),
  };
}
