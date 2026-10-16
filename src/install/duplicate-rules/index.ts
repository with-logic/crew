/**
 * Duplicate-install detection and flag promotion (§5.4, §11.1).
 *
 * Compares the resolved install set against current state, putting each
 * entry in one of two buckets:
 *
 *   - `toInstall` — no existing entry, OR same source at a different SHA.
 *   - `alreadyInstalled` — same source + same SHA + same content hash.
 *
 * An already-installed entry may also need a one-way flag set without
 * re-staging (`promotions`, applied by `../promote-flags.ts`): `explicit`
 * for one first pulled in as a dependency and now named, `tracks_tap` for
 * one installed on its own and now reached by a whole install of its tap,
 * on that tap at the same ref.
 *
 * A different-source install of the same name throws `name_conflict`
 * (never overridden by --force — per §13). "Same source" means the same
 * canonical location: the same repo (or directory) and the same path
 * inside it, per `../source-identity.ts`. One repo can back several taps
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
import { classifySource, hasSameAttribution } from "./classify.ts";
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
  const promotions: { explicit: string[]; tracksTap: string[] } = { explicit: [], tracksTap: [] };
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

    // The set of adapters active for this install — if it includes
    // any adapter the existing entry doesn't, the install still has
    // work to do (attach ownership to those adapters), even if the
    // bytes are identical. Similarly with --force.
    const newAdapters = options.activeAgents.filter((a) => !existing.agents.includes(a));
    const upToDate =
      existing.resolved_sha === skill.resolvedSha &&
      existing.content_hash === skill.contentHash &&
      newAdapters.length === 0 &&
      !options.force;

    const sameAttribution = hasSameAttribution(existing, skill);
    const reattribution = classifySource(
      existing,
      skill,
      options.taps,
      incomingProjectRoot,
      !upToDate,
    );
    if (reattribution) reattributions.push(reattribution);
    // Registered attribution, and a subscription the incoming install
    // doesn't take over, survive reinstalls as well as duplicate
    // short-circuits (§5.4, §10.1.1).
    else if (!sameAttribution) {
      // Successful source classification already proved this tap exists.
      const tap = options.taps.find((row) => row.name === existing.source.tap)!;
      keepSource.push({
        name: existing.name,
        scope: existing.scope,
        projectRoot: incomingProjectRoot,
        source: existing.source,
        tap,
      });
    }

    if (upToDate) {
      alreadyInstalled.push({
        name: skill.name,
        ref: existing.ref,
        resolvedSha: existing.resolved_sha,
        scope: existing.scope,
        agents: existing.agents,
        ...(reattribution ? { reattributedFrom: reattribution.fromTap } : {}),
      });
      if (skill.explicit && !existing.explicit) promotions.explicit.push(skill.name);
      // §11.1: only onto the tap, path, and ref this install subscribes
      // to — an entry that keeps another tap, or sits at another ref,
      // would follow siblings the user never asked for. (A moved entry
      // takes it with the move, by the same rule: `./classify.ts`.)
      const onIncomingTapAtRef = sameAttribution && existing.ref === skill.ref;
      if (skill.tracksTap && existing.tracks_tap !== true && onIncomingTapAtRef)
        promotions.tracksTap.push(skill.name);
      continue;
    }
    // Same source, different SHA, or a new active adapter, or --force
    // → install (possibly as no-op byte-copy but with marker rewrite).
    toInstall.push(skill);
  }
  return { toInstall, alreadyInstalled, promotions, reattributions, keepSource };
}
