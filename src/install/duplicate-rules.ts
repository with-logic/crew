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
 * (never overridden by --force — per §13). "Same source" now means
 * "same tap name + same path inside the tap" — the URL/filesystem
 * location lives on the tap row, not on the entry.
 */

import { CrewError } from "../core/errors.ts";
import type { ResolvedSkill, Scope, StateFile } from "../core/types.ts";

export interface AlreadyInstalled {
  readonly name: string;
  readonly ref: string | null;
  readonly resolvedSha: string | null;
  readonly scope: Scope;
  readonly agents: readonly string[];
}

export interface DuplicateAnalysis {
  readonly toInstall: ResolvedSkill[];
  readonly alreadyInstalled: AlreadyInstalled[];
  readonly promoteToExplicit: string[];
}

export function applyDuplicateRules(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  scope: Scope,
  cwd: string,
  options: { readonly activeAgents: readonly string[]; readonly force: boolean } = {
    activeAgents: [],
    force: false,
  },
): DuplicateAnalysis {
  const toInstall: ResolvedSkill[] = [];
  const alreadyInstalled: AlreadyInstalled[] = [];
  const promoteToExplicit: string[] = [];

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

    const sameSource =
      existing.source.tap === skill.tap.name && existing.source.path === skill.tapRelativePath;
    if (!sameSource) {
      throw new CrewError(
        "name_conflict",
        `a skill named \`${skill.name}\` is already installed from a different source — run \`crew uninstall ${skill.name}\` first, then install from the new source`,
        {
          existing: existing.source,
          incoming: { tap: skill.tap.name, path: skill.tapRelativePath },
        },
      );
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
  return { toInstall, alreadyInstalled, promoteToExplicit };
}
