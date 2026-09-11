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
 * reaches the same location through a broader tap, the entry is
 * re-attributed to the broader tap (§16.5) instead of conflicting.
 */

import { CrewError } from "../core/errors.ts";
import type { ResolvedSkill, Scope, StateEntry, StateFile, TapConfig } from "../core/types.ts";
import { identityOfStateSource, sameSourceIdentity, sourceIdentityOf } from "./source-identity.ts";

export interface AlreadyInstalled {
  readonly name: string;
  readonly ref: string | null;
  readonly resolvedSha: string | null;
  readonly scope: Scope;
  readonly agents: readonly string[];
  /** Set when the entry moved to a broader tap covering the same source. */
  readonly reattributedFrom?: string;
}

/** An entry whose tap attribution moves to a tap covering the same source. */
export interface Reattribution {
  readonly name: string;
  readonly scope: Scope;
  readonly projectRoot: string | null;
  readonly fromTap: string;
  readonly toTap: string;
  readonly toPath: string;
}

export interface DuplicateAnalysis {
  readonly toInstall: ResolvedSkill[];
  readonly alreadyInstalled: AlreadyInstalled[];
  readonly promoteToExplicit: string[];
  readonly reattributions: Reattribution[];
}

export interface DuplicateOptions {
  readonly activeAgents: readonly string[];
  readonly force: boolean;
  /** Tap rows the existing state entries reference, for identity resolution. */
  readonly taps: readonly TapConfig[];
}

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
  return { toInstall, alreadyInstalled, promoteToExplicit, reattributions };
}

/**
 * Decide whether `skill` may land on top of `existing`. Throws
 * `name_conflict` when the two name genuinely different sources.
 * Returns a `Reattribution` when the entry should move to the incoming
 * (broader) tap, or null when attribution already matches.
 */
function classifySource(
  existing: StateEntry,
  skill: ResolvedSkill,
  taps: readonly TapConfig[],
  projectRoot: string | null,
): Reattribution | null {
  if (existing.source.tap === skill.tap.name && existing.source.path === skill.tapRelativePath) {
    return null;
  }
  const existingIdentity = identityOfStateSource(existing.source, taps);
  const incomingIdentity = sourceIdentityOf(skill.tap, skill.tapRelativePath);
  if (existingIdentity === null || !sameSourceIdentity(existingIdentity, incomingIdentity)) {
    throw new CrewError(
      "name_conflict",
      `a skill named \`${skill.name}\` is already installed from a different source — run \`crew uninstall ${skill.name}\` first, then install from the new source`,
      {
        existing: existing.source,
        incoming: { tap: skill.tap.name, path: skill.tapRelativePath },
      },
    );
  }
  // Same bytes, same place, different tap row. A registered tap is the
  // user's own naming choice — leave it alone. An auto tap is crew's
  // bookkeeping, so move the entry onto the incoming tap.
  const existingTap = taps.find((t) => t.name === existing.source.tap);
  if (existingTap?.registered !== false) return null;
  return {
    name: existing.name,
    scope: existing.scope,
    projectRoot,
    fromTap: existing.source.tap,
    toTap: skill.tap.name,
    toPath: skill.tapRelativePath,
  };
}
