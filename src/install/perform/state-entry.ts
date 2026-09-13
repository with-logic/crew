/**
 * State-entry shaping for the install loop (§9 step 10, §11.1).
 *
 * Two pure transforms the install loop applies to `state.json`: building
 * the entry for a freshly-installed skill, and rebuilding `required_by`
 * edges across every skill this install touched. Split from the loop in
 * `./index.ts` because they evolve with the state schema, not with the
 * per-agent install algorithm.
 */

import type { ResolvedSkill, Scope, StateEntry, StateFile } from "../../core/types.ts";
import { nowIso } from "../../util/time.ts";
import type { KeptSource } from "../duplicate-rules/index.ts";
import type { RequiredByMap } from "../resolve/index.ts";

/**
 * Build the state entry for a freshly-installed skill. For project-scope
 * installs, `project_root` captures `cwd` — the directory the user ran
 * `crew install` from — so future update/uninstall/doctor operations
 * can find the install regardless of the user's cwd at that later time.
 */
export function buildStateEntry(
  skill: ResolvedSkill,
  scope: Scope,
  successfulAgents: string[],
  state: StateFile,
  options: { readonly requiredBy: RequiredByMap; readonly keepSource?: readonly KeptSource[] },
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
  // `tracks_tap` is one-way too: once a user asked for the whole tap,
  // siblings keep following, even if a later `crew install <same>/<one>`
  // would be individual on its own.
  const tracksTap = skill.tracksTap || (existing?.tracks_tap ?? false);
  const required_by = [...(options.requiredBy.get(skill.name) ?? [])].sort();
  // Merge preserves agents from prior installs that aren't part of
  // this operation (e.g. agent X installed the skill last run; this
  // run adds agent Y to the same dest — state should list both).
  const mergedAgents = [
    ...new Set<string>([...(existing?.agents ?? []), ...successfulAgents]),
  ].sort();
  // A pinned source outranks the incoming tap: re-attribution already
  // refused this move as a narrowing, so the install must not perform it
  // anyway (§5.4, §10.1.1).
  const pinnedSource = options.keepSource?.find(
    (k) => k.name === skill.name && k.scope === scope && k.projectRoot === incomingProjectRoot,
  );
  return {
    name: skill.name,
    source: pinnedSource?.source ?? { tap: skill.tap.name, path: skill.tapRelativePath },
    ref: skill.ref,
    resolved_sha: skill.resolvedSha,
    content_hash: skill.contentHash,
    scope,
    installed_at: nowIso(),
    agents: mergedAgents,
    pinned: skill.pinned,
    explicit,
    ...(tracksTap ? { tracks_tap: true } : {}),
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
export function rebuildRequiredBy(
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
