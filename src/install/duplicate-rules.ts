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
 * (never overridden by --force — per §13).
 */

import { CrewError } from "../core/errors.ts";
import type { ResolvedSkill, Scope, StateFile } from "../core/types.ts";

/** A skill that was already installed at the same ref/SHA — no-op. */
export interface AlreadyInstalled {
  readonly name: string;
  /** Ref the existing install was installed from (or null for default). */
  readonly ref: string | null;
  /** Full 40-char resolved SHA, or null for path sources. */
  readonly resolvedSha: string | null;
  readonly scope: Scope;
  readonly targets: readonly string[];
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
): DuplicateAnalysis {
  const toInstall: ResolvedSkill[] = [];
  const alreadyInstalled: AlreadyInstalled[] = [];
  const promoteToExplicit: string[] = [];

  // For project-scope installs, match by (name, scope, project_root).
  // Two project installs of the same skill under different roots are
  // independent entries, not a name conflict. For user scope
  // `project_root` is undefined on both sides → comparison collapses.
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

    const sameSource = markerSourcesEqual(existing.source, skill.markerSource);
    if (!sameSource) {
      // Per §13: --force does NOT override name_conflict, so we throw
      // the same message either way. The user has to remove the old
      // install first, then install from the new source.
      throw new CrewError(
        "name_conflict",
        `a skill named \`${skill.name}\` is already installed from a different source — run \`crew uninstall ${skill.name}\` first, then install from the new source`,
        { existing: existing.source, incoming: skill.markerSource },
      );
    }

    if (
      existing.resolved_sha === skill.resolvedSha &&
      existing.content_hash === skill.contentHash
    ) {
      alreadyInstalled.push({
        name: skill.name,
        ref: existing.ref,
        resolvedSha: existing.resolved_sha,
        scope: existing.scope,
        targets: existing.targets,
      });
      // §11.1: a previously dep-only entry named directly by the user
      // must be promoted to `explicit: true`, even if the SHA is
      // unchanged and no reinstall happens.
      if (skill.explicit && !existing.explicit) {
        promoteToExplicit.push(skill.name);
      }
      continue;
    }
    // Same source, different SHA → treat as update.
    toInstall.push(skill);
  }
  return { toInstall, alreadyInstalled, promoteToExplicit };
}

function markerSourcesEqual(
  a: ResolvedSkill["markerSource"],
  b: ResolvedSkill["markerSource"],
): boolean {
  if (a.type === "tap" && b.type === "tap") return a.tap === b.tap;
  if (a.type === "git" && b.type === "git") return a.url === b.url;
  if (a.type === "path" && b.type === "path") return a.path === b.path;
  return false;
}
