/**
 * Shared types for duplicate-install detection (§5.4).
 *
 * Split from the algorithm so the classification rules in `./classify.ts`
 * and the partitioning loop in `./index.ts` can both name them without a
 * cycle, and so downstream consumers import a type without pulling in
 * the install logic.
 */

import type { ResolvedSkill, Scope, StateEntry, TapConfig } from "../../core/types.ts";
import type { Promotions } from "../promote-flags.ts";

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
   * Whether the moved entry takes the incoming install's subscription:
   * the install is of the whole tap, at the ref the entry ends at (§11.1).
   * Carried with a move made before the install, because an
   * already-installed entry skips `performInstall`, which otherwise
   * records `tracks_tap` (§10.1.1).
   */
  readonly tracksTap: boolean;
}

/**
 * Attribution retained when a reinstall must preserve a registered tap,
 * or a tracking entry's own tap the incoming install doesn't take over
 * (§5.4, §10.1.1); whether the subscription survives too is
 * `buildStateEntry`'s call (the same ref only). The full descriptor keeps
 * authoritative markers consistent with state (§11.1).
 */
export interface KeptSource {
  readonly name: string;
  readonly scope: Scope;
  readonly projectRoot: string | null;
  readonly source: StateEntry["source"];
  readonly tap: TapConfig;
}

export interface DuplicateAnalysis {
  readonly toInstall: ResolvedSkill[];
  readonly alreadyInstalled: AlreadyInstalled[];
  /** One-way flags to set on already-installed entries (`../promote-flags.ts`). */
  readonly promotions: Promotions;
  /** Moves of already-installed entries, made before the install runs. */
  readonly reattributions: Reattribution[];
  /**
   * Moves of entries the install reinstalls: `performInstall` writes the
   * incoming attribution itself, and the entry's other markers follow
   * only if it succeeds (§5.4).
   */
  readonly movesOnSuccess: Reattribution[];
  readonly keepSource: KeptSource[];
}

export interface DuplicateOptions {
  readonly activeAgents: readonly string[];
  readonly force: boolean;
  /** Tap rows the existing state entries reference, for identity resolution. */
  readonly taps: readonly TapConfig[];
}
