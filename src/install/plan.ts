/**
 * The state pipeline every `crew install` runs (§5.4, §9, §11.1), shared
 * by the real run (`./flow.ts`, under the state lock) and the dry run
 * (`./preview.ts`), so what a dry run reports — C-INST-13o's attribution
 * changes included — is what the run does: duplicate rules, the move
 * preflight, up-front moves, the install, then promotions.
 *
 * Planning writes nothing itself. The one thing the real run does in the
 * middle — writing config and the up-front markers once nothing is
 * refused — is its `beforeInstall` hook.
 */

import type { AgentAdapter } from "../agents/adapter.ts";
import type { ResolvedSkill, Scope, StateFile } from "../core/types.ts";
import { type AttributionChange, attributionChanges } from "./attribution-changes.ts";
import {
  applyDuplicateRules,
  type DuplicateAnalysis,
  type DuplicateOptions,
} from "./duplicate-rules/index.ts";
import { type InstallSummary, performInstall } from "./perform/index.ts";
import { promoteFlags } from "./promote-flags.ts";
import { applyReattributions } from "./reattribute/index.ts";
import { preflightMoves } from "./reattribute/preflight.ts";
import type { RequiredByMap } from "./resolve/index.ts";

/** How a run installs: where, with what flags, and whether it writes. */
export interface InstallRun {
  readonly scope: Scope;
  readonly cwd: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly requiredBy: RequiredByMap;
  readonly duplicates: DuplicateOptions;
}

/** A run's analysis, its install summary, the state it ends at, and what changed. */
export interface InstallPlan {
  readonly analysis: DuplicateAnalysis;
  readonly summary: InstallSummary;
  /** `summary.newState` with the analysis' promotions applied (§11.1). */
  readonly after: StateFile;
  readonly changes: readonly AttributionChange[];
}

/**
 * Install `resolved` against `state`. A move whose markers can't follow
 * refuses the run before `beforeInstall` runs (§5.4); a dry run's install
 * writes nothing (`performInstall`).
 */
export function planInstall(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  agents: readonly AgentAdapter[],
  run: InstallRun,
  beforeInstall?: (analysis: DuplicateAnalysis) => void,
): InstallPlan {
  const analysis = applyDuplicateRules(resolved, state, run.scope, run.cwd, run.duplicates);
  preflightMoves(analysis, agents, run.cwd);
  beforeInstall?.(analysis);
  // §5.4: entries the install finds already installed skip the install,
  // so their moves apply here; moves of reinstalled entries wait for it.
  const summary = performInstall(
    analysis.toInstall,
    agents,
    run.scope,
    run.cwd,
    applyReattributions(state, analysis.reattributions),
    {
      force: run.force,
      dryRun: run.dryRun,
      requiredBy: run.requiredBy,
      allResolved: resolved,
      keepSource: analysis.keepSource,
    },
  );
  const projectRoot = run.scope === "project" ? run.cwd : null;
  const after = promoteFlags(summary.newState, analysis.promotions, run.scope, projectRoot);
  return { analysis, summary, after, changes: attributionChanges(state, after) };
}
