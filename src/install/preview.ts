/**
 * `crew install --dry-run` (§9): the run's plan (`./plan.ts`) against
 * unlocked state, writing nothing. It refuses what the run would (§5.4),
 * and reports the attribution changes the run would make (C-INST-13o)
 * from the same moves, reinstalls, and promotions, applied to state it
 * never writes.
 */

import type { AgentAdapter } from "../agents/adapter.ts";
import type { ResolvedSkill, StateFile } from "../core/types.ts";
import type { AttributionChange } from "./attribution-changes.ts";
import type { AlreadyInstalled } from "./duplicate-rules/index.ts";
import type { InstallSummary } from "./perform/index.ts";
import { type InstallRun, planInstall } from "./plan.ts";

/** What a dry run reports. */
export interface InstallPreview {
  readonly summary: InstallSummary;
  readonly alreadyInstalled: readonly AlreadyInstalled[];
  readonly changes: readonly AttributionChange[];
}

/** The dry run of installing `resolved` at `run.scope` in `run.cwd`. */
export function previewInstall(
  resolved: readonly ResolvedSkill[],
  state: StateFile,
  agents: readonly AgentAdapter[],
  run: Omit<InstallRun, "dryRun">,
): InstallPreview {
  const plan = planInstall(resolved, state, agents, { ...run, dryRun: true });
  return {
    summary: plan.summary,
    alreadyInstalled: plan.analysis.alreadyInstalled,
    changes: plan.changes,
  };
}
