/**
 * Duplicate-install detection (§5.4).
 *
 * Compares the resolved install set against current state, partitioning
 * each entry into one of three buckets:
 *
 *   - `toInstall` — no existing entry, OR same source at a different SHA.
 *   - `alreadyInstalled` — same source + same SHA + same content hash.
 *   - `promoteToExplicit` — was-a-dep, now-explicitly-named. Handled
 *      separately so the install loop can flip the flag without
 *      re-staging.
 *
 * A different-source install of the same name throws `name_conflict`
 * (never overridden by --force — per §13). "Same source" means the same
 * canonical location: the same repo (or directory) and the same path
 * inside it, per `./source-identity.ts`. One repo can back several taps
 * — installing `//skills/docx` and later the whole repo reaches the same
 * directory two ways — so comparing tap names would report a conflict
 * where there is none.
 *
 * When the existing entry sits on an auto tap and the incoming install
 * reaches the same location through another tap covering it, the
 * entry is re-attributed to the incoming tap (§16.5) instead of
 * conflicting.
 */

import type { ResolvedSkill, Scope, StateFile } from "../../core/types.ts";
import { classifySource, narrowsSubscription } from "./classify.ts";
import type {
  AlreadyInstalled,
  DuplicateAnalysis,
  DuplicateOptions,
  KeptSource,
  Reattribution,
} from "./types.ts";

export type {
  AlreadyInstalled,
  DuplicateAnalysis,
  DuplicateOptions,
  KeptSource,
  Reattribution,
} from "./types.ts";

export function applyDuplicateRules(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  scope: Scope,
  cwd: string,
  options: DuplicateOptions = { activeAgents: [], force: false, taps: [] },
): DuplicateAnalysis {
  const toInstall: ResolvedSkill[] = [];
  const alreadyInstalled: AlreadyInstalled[] = [];
  const promoteToExplicit: string[] = [];
  const reattributions: Reattribution[] = [];
  const keepSource: KeptSource[] = [];

  const incomingProjectRoot = scope === "project" ? cwd : null;
  for (const skill of resolved) {
    const existing = state.installations.find(
      (e) =>
        e.name === skill.name &&
        e.scope === scope &&
        (e.project_root ?? null) === incomingProjectRoot,
    );
    if (!existing) {
      toInstall.push(skill);
      continue;
    }

    const reattribution = classifySource(existing, skill, options.taps, incomingProjectRoot);
    if (reattribution) reattributions.push(reattribution);
    // The move was rejected as a narrowing, but the skill may still be
    // installed (--force, or a newly active adapter). Pin the existing
    // attribution so the install can't do by the back door what
    // re-attribution just refused.
    else if (narrowsSubscription(existing, skill, options.taps)) {
      keepSource.push({
        name: existing.name,
        scope: existing.scope,
        projectRoot: incomingProjectRoot,
        source: existing.source,
      });
    }

    // The set of adapters active for this install — if it includes
    // any adapter the existing entry doesn't, the install still has
    // work to do (attach ownership to those adapters), even if the
    // bytes are identical. Similarly with --force.
    const newAdapters = options.activeAgents.filter((a) => !existing.agents.includes(a));
    const adaptersChanged = newAdapters.length > 0;

    if (
      existing.resolved_sha === skill.resolvedSha &&
      existing.content_hash === skill.contentHash &&
      !adaptersChanged &&
      !options.force
    ) {
      alreadyInstalled.push({
        name: skill.name,
        ref: existing.ref,
        resolvedSha: existing.resolved_sha,
        scope: existing.scope,
        agents: existing.agents,
        ...(reattribution ? { reattributedFrom: reattribution.fromTap } : {}),
      });
      if (skill.explicit && !existing.explicit) {
        promoteToExplicit.push(skill.name);
      }
      continue;
    }
    // Same source, different SHA, or a new active adapter, or --force
    // → install (possibly as no-op byte-copy but with marker rewrite).
    toInstall.push(skill);
  }
  return { toInstall, alreadyInstalled, promoteToExplicit, reattributions, keepSource };
}
