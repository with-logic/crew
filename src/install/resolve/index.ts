/**
 * Resolve a list of references into the install set: attribute each ref
 * to a tap (creating auto-taps as needed), acquire the tap on disk,
 * expand directories, and walk dependencies.
 *
 * Output:
 *   - every `ResolvedSkill` to install (topologically ordered: deps
 *     before dependents);
 *   - a `requiredBy` map for `state.required_by` maintenance;
 *   - the (possibly extended) `Config` reflecting any auto-taps the
 *     resolution created — the caller persists it under the state lock.
 *
 * Every install attributes its skills to exactly one tap (§16.5).
 */

import { CrewError } from "../../core/errors.ts";
import { crewHome } from "../../core/paths.ts";
import type { Config, ResolvedSkill } from "../../core/types.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import type { KindHint } from "../resolve-ref/index.ts";
import { topoSort } from "../topo.ts";
import { enqueueDeps } from "./dep/index.ts";
import type { PendingItem } from "./enqueue.ts";
import { enqueueRoot, sameInstallSetSource, sourceLabel } from "./root.ts";

/** Options for resolution. */
export interface ResolveOptions {
  readonly cwd: string;
  readonly home: string;
  /**
   * Optional force-one-kind hint for bare-name / 2-segment refs. Set
   * by `--tap` / `--bundle` / `--skill` on the CLI. Applies to every
   * root ref; dependencies never see a hint.
   */
  readonly kindHint: KindHint;
  /** Opt direct git/path roots into recursive fallback discovery. */
  readonly recursive: boolean;
}

/** name → set of names that depend on it. */
export type RequiredByMap = Map<string, Set<string>>;

/** Output of resolution. */
export interface ResolveResult {
  readonly skills: readonly ResolvedSkill[];
  readonly requiredBy: RequiredByMap;
  /** Config including any auto-taps we created. Caller writes it. */
  readonly config: Config;
  /**
   * Skill directories that failed validation during expansion and
   * were soft-skipped. The install command surfaces them and factors
   * them into the exit code per PRD §9 step 9.
   */
  readonly skipped: readonly SkippedSkill[];
}

/**
 * Resolve a list of references into a topologically-ordered install set.
 */
export function resolveInstallSet(
  refs: readonly string[],
  startingConfig: Config,
  options: Partial<ResolveOptions> = {},
): ResolveResult {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? crewHome();
  const kindHint: KindHint = options.kindHint ?? null;
  const recursive = options.recursive ?? false;

  let config = startingConfig;
  const byName = new Map<string, ResolvedSkill>();
  const requiredBy: RequiredByMap = new Map();
  const pending: PendingItem[] = [];
  const skipped: SkippedSkill[] = [];

  // Step 1–5: resolve every root reference.
  for (const raw of refs) {
    const enqueued = enqueueRoot(raw, config, cwd, home, kindHint, recursive);
    config = enqueued.config;
    pending.push(...enqueued.items);
    skipped.push(...enqueued.skipped);
  }

  // Step 6: dependency walk.
  while (pending.length > 0) {
    const item = pending.shift()!;
    const name = item.loaded.frontmatter.name;
    if (byName.has(name)) {
      const existing = byName.get(name)!;
      if (sameInstallSetSource(existing, item) && existing.resolvedSha === item.resolvedSha)
        continue;
      const existingSha = existing.resolvedSha ?? "<null>";
      const incomingSha = item.resolvedSha ?? "<null>";
      const existingSource = sourceLabel(
        existing.tap.name,
        existing.tapRelativePath,
        existing.resolvedSha,
      );
      const incomingSource = sourceLabel(item.tap.name, item.tapRelativePath, item.resolvedSha);
      if (existing.resolvedSha !== item.resolvedSha) {
        throw new CrewError(
          "conflicting_dependencies",
          `\`${name}\` appears twice in this install set with different SHAs (${existingSha.slice(0, 8)} vs ${incomingSha.slice(0, 8)}) — pin one to a specific version, or install them separately`,
          { name, existing: existing.resolvedSha, incoming: item.resolvedSha },
        );
      }
      throw new CrewError(
        "conflicting_dependencies",
        `\`${name}\` appears twice in this install set from different sources (${existingSource} vs ${incomingSource}) — rename one skill or install them separately`,
        { name, existing: existingSource, incoming: incomingSource },
      );
    }

    const staged = item.staged;
    byName.set(name, {
      storePath: staged.storePath,
      name,
      frontmatter: item.loaded.frontmatter,
      tap: item.tap,
      tapRelativePath: item.tapRelativePath,
      ref: item.requestedRef,
      resolvedSha: item.resolvedSha,
      pinned: item.pinned,
      contentHash: staged.contentHash,
      explicit: item.explicit,
      tracksTap: item.tracksTap,
    });

    // Enqueue dependencies (if any). Batched so a pinned parent's
    // commit is exported once for all of them, not once per edge.
    const deps = item.loaded.frontmatter.metadata?.crew?.dependencies ?? [];
    if (deps.length > 0) {
      const enqueued = enqueueDeps(deps, item, config, cwd, home);
      config = enqueued.config;
      skipped.push(...enqueued.skipped);
      for (const depItem of enqueued.items) {
        pending.push(depItem);
        const depName = depItem.loaded.frontmatter.name;
        if (!requiredBy.has(depName)) requiredBy.set(depName, new Set());
        requiredBy.get(depName)!.add(name);
      }
    }
  }

  return { skills: topoSort(byName, requiredBy), requiredBy, config, skipped };
}
