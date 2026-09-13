/**
 * Shared types for duplicate-install detection (§5.4).
 *
 * Split from the algorithm so the classification rules in `./classify.ts`
 * and the partitioning loop in `./index.ts` can both name them without a
 * cycle, and so downstream consumers import a type without pulling in
 * the install logic.
 */

import type { ResolvedSkill, Scope, StateEntry, TapConfig } from "../../core/types.ts";

export interface AlreadyInstalled {
  readonly name: string;
  readonly ref: string | null;
  readonly resolvedSha: string | null;
  readonly scope: Scope;
  readonly agents: readonly string[];
  /** Set when the entry moved to an incoming tap covering the same source. */
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
  /**
   * Whether the incoming install subscribed to its whole tap. Carried
   * with the move because a re-attributed entry never reaches
   * `performInstall`, which is the only other place `tracks_tap` is
   * written (§10.1.1).
   */
  readonly tracksTap: boolean;
}

/**
 * A skill whose install must not rewrite the existing entry's `source`.
 * Classification refused to re-attribute because the incoming tap is
 * rooted deeper in the same repo, but `--force` and new-adapter installs
 * still route the skill through `performInstall`, which would otherwise
 * overwrite the broader attribution and silently end sibling
 * re-expansion (§10.1.1).
 */
export interface KeptSource {
  readonly name: string;
  readonly scope: Scope;
  readonly projectRoot: string | null;
  readonly source: StateEntry["source"];
}

export interface DuplicateAnalysis {
  readonly toInstall: ResolvedSkill[];
  readonly alreadyInstalled: AlreadyInstalled[];
  readonly promoteToExplicit: string[];
  readonly reattributions: Reattribution[];
  readonly keepSource: KeptSource[];
}

export interface DuplicateOptions {
  readonly activeAgents: readonly string[];
  readonly force: boolean;
  /** Tap rows the existing state entries reference, for identity resolution. */
  readonly taps: readonly TapConfig[];
}
