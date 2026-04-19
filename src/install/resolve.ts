/**
 * Resolve a list of references into the install set: acquire sources,
 * validate skills, expand directories, and walk dependencies.
 *
 * This is the heart of `crew install` (§9 steps 1–6). The output is
 * every `ResolvedSkill` that must be staged and copied into targets,
 * plus an install-order guaranteed to place dependencies before dependents.
 *
 * `ResolvedSkill.explicit` is true for skills the user named on the
 * command line (roots), and — per §9 step 5 — for every child of a
 * multi-skill bundle the user referenced. It is false for skills
 * pulled in solely as transitive dependencies. `bundle` is set on
 * every child of a multi-skill directory expansion (§10.1.1).
 *
 * Topological sort lives in `install/topo.ts`; the dependency-reference
 * precedence and marker-source derivation live in
 * `install/dep-resolution.ts`. This file is the BFS driver.
 */

import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import type { BundleRef, Config, LoadedSkill, MarkerSource, ResolvedSkill } from "../core/types.ts";
import { parseRef } from "../refs/parse.ts";
import { type AcquiredSource, acquireSource } from "../sources/acquire/index.ts";
import { expandSkills } from "../sources/expand.ts";
import { stageIntoStore } from "../sources/store.ts";
import { markerSourceFor, resolveDependency } from "./dep-resolution.ts";
import { topoSort } from "./topo.ts";

/** Options for resolution. */
export interface ResolveOptions {
  readonly cwd: string;
  readonly home: string;
}

/**
 * Map of `skill name → direct dependents (at the same scope)`. The
 * install flow consumes this to set `required_by` on every state entry.
 */
export type RequiredByMap = Map<string, Set<string>>;

/** Output of resolution: the ordered install set plus the dependent graph. */
export interface ResolveResult {
  readonly skills: readonly ResolvedSkill[];
  readonly requiredBy: RequiredByMap;
}

/**
 * Resolve a list of references into a topologically-ordered install set.
 */
export function resolveInstallSet(
  refs: readonly string[],
  config: Config,
  options: Partial<ResolveOptions> = {},
): ResolveResult {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();

  // Records added by name so dependency re-entry is idempotent.
  const byName = new Map<string, ResolvedSkill>();
  // Queue of (skill, parent-context) pairs still to be processed.
  interface PendingResolution {
    readonly loaded: LoadedSkill;
    readonly markerSource: MarkerSource;
    readonly resolvedSha: string | null;
    readonly requestedRef: string | null;
    readonly pinned: boolean;
    readonly parentAcquired: AcquiredSource | null;
    readonly explicit: boolean;
    readonly bundle: BundleRef | null;
  }
  const pending: PendingResolution[] = [];

  // Step 1–5: resolve every root reference.
  for (const raw of refs) {
    const source = parseRef(raw, cwd);
    const acquired = acquireSource(source, config, home);
    const loadedList = expandSkills(acquired.rootDir);
    // §9 step 5: a multi-skill expansion is a bundle. A single-skill
    // expansion (root SKILL.md present) is not. `BundleRef.source`
    // excludes `path` by construction, so we narrow before storing.
    const bundle: BundleRef | null =
      loadedList.length > 1 && acquired.markerSource.type !== "path"
        ? { ref: raw, source: acquired.markerSource }
        : null;
    for (const loaded of loadedList) {
      const markerSource = markerSourceFor(acquired, source, loaded, acquired.rootDir);
      pending.push({
        loaded,
        markerSource,
        resolvedSha: acquired.resolvedSha,
        requestedRef: acquired.requestedRef,
        pinned: acquired.pinned,
        parentAcquired: acquired,
        explicit: true,
        bundle,
      });
    }
  }

  const requiredBy: RequiredByMap = new Map();

  // Step 6: dependency walk. We do this breadth-first, processing each
  // pending skill: stage it, then for each dependency queue a new
  // `PendingResolution` if we don't already have it.
  while (pending.length > 0) {
    const item = pending.shift()!;
    const name = item.loaded.frontmatter.name;
    if (byName.has(name)) {
      // Conflict check per §9 step 6 last paragraph.
      const existing = byName.get(name)!;
      if (existing.resolvedSha !== item.resolvedSha)
        throw new CrewError(
          "conflicting_dependencies",
          `\`${name}\` appears twice in this install set with different SHAs (${(existing.resolvedSha ?? "<null>").slice(0, 8)} vs ${(item.resolvedSha ?? "<null>").slice(0, 8)}) — pin one to a specific version, or install them separately`,
          { name, existing: existing.resolvedSha, incoming: item.resolvedSha },
        );
      // Roots are enqueued before any dep walk, so by the time a dep's
      // second visit arrives, the matching root has already populated
      // `byName` with `explicit: true`. A late visit is either a
      // non-explicit dep (skip) or re-entry of the same explicit root
      // (also skip, no change). In-flight explicit promotion would
      // need deps enqueued before roots, which doesn't happen here.
      continue;
    }

    const staged = stageIntoStore(item.loaded.path, name, item.resolvedSha, home);
    const resolved: ResolvedSkill = {
      storePath: staged.storePath,
      name,
      frontmatter: item.loaded.frontmatter,
      markerSource: item.markerSource,
      ref: item.requestedRef,
      resolvedSha: item.resolvedSha,
      pinned: item.pinned,
      contentHash: staged.contentHash,
      explicit: item.explicit,
      ...(item.bundle === null ? {} : { bundle: item.bundle }),
    };
    byName.set(name, resolved);

    // Enqueue dependencies (if any). Deps are never explicit and never
    // inherit the parent's bundle (§11.1 — dependencies belong to their
    // parent, not to the bundle that pulled in the parent).
    const deps = item.loaded.frontmatter.metadata?.crew?.dependencies ?? [];
    for (const depRef of deps) {
      const depSource = parseRef(depRef, cwd);
      const resolvedDep = resolveDependency(depSource, depRef, item.parentAcquired, (s) =>
        acquireSource(s, config, home),
      );
      if (resolvedDep === null) continue;
      const { acquired, loaded, markerSource } = resolvedDep;
      pending.push({
        loaded,
        markerSource,
        resolvedSha: acquired.resolvedSha,
        requestedRef: acquired.requestedRef,
        pinned: acquired.pinned,
        parentAcquired: acquired,
        explicit: false,
        bundle: null,
      });
      // Record the parent→dep edge so the install flow can set
      // `required_by` on the dep entry.
      const depName = loaded.frontmatter.name;
      if (!requiredBy.has(depName)) requiredBy.set(depName, new Set());
      requiredBy.get(depName)!.add(name);
    }
  }

  return { skills: topoSort(byName), requiredBy };
}
