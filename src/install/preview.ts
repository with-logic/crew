/**
 * `crew install --dry-run` (§9): the run's analysis against unlocked
 * state, writing nothing. It refuses what the run would (§5.4), and
 * reports the attribution changes the run would make (C-INST-13o) by
 * applying the same moves, reinstalls, and promotions to state it never
 * writes.
 */

import type { AgentAdapter } from "../agents/adapter.ts";
import type { ResolvedSkill, Scope, StateFile } from "../core/types.ts";
import { type AttributionChange, attributionChanges } from "./attribution-changes.ts";
import {
  type AlreadyInstalled,
  applyDuplicateRules,
  type DuplicateOptions,
} from "./duplicate-rules/index.ts";
import { type InstallSummary, performInstall } from "./perform/index.ts";
import { promoteFlags } from "./promote-flags.ts";
import { applyReattributions } from "./reattribute/index.ts";
import { preflightMoves } from "./reattribute/preflight.ts";
import type { RequiredByMap } from "./resolve/index.ts";

/** What a dry run reports. */
export interface InstallPreview {
  readonly summary: InstallSummary;
  readonly alreadyInstalled: readonly AlreadyInstalled[];
  readonly changes: readonly AttributionChange[];
}

/** The dry run of installing `resolved` at `scope` in `cwd`. */
export function previewInstall(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  agents: readonly AgentAdapter[],
  run: {
    readonly scope: Scope;
    readonly cwd: string;
    readonly force: boolean;
    readonly requiredBy: RequiredByMap;
    readonly duplicates: DuplicateOptions;
  },
): InstallPreview {
  const analysis = applyDuplicateRules(resolved, state, run.scope, run.cwd, run.duplicates);
  preflightMoves(analysis, agents, run.cwd);
  const summary = performInstall(
    analysis.toInstall,
    agents,
    run.scope,
    run.cwd,
    applyReattributions(state, analysis.reattributions),
    {
      force: run.force,
      dryRun: true,
      requiredBy: run.requiredBy,
      allResolved: resolved,
      keepSource: analysis.keepSource,
    },
  );
  const projectRoot = run.scope === "project" ? run.cwd : null;
  const after = promoteFlags(summary.newState, analysis.promotions, run.scope, projectRoot);
  return {
    summary,
    alreadyInstalled: analysis.alreadyInstalled,
    changes: attributionChanges(state, after),
  };
}
