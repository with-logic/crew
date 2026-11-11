/**
 * Settling a project after a bare `crew install` (§9.2, §9.3): reconcile
 * ownership, then bring the lockfile up to date, and say what that did.
 */

import type { ResolvedSkill } from "../../../core/types.ts";
import type { Manifest } from "../../../manifest/index.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext } from "../../types.ts";
import { renderDropped } from "../render/dropped.ts";
import { recordLock } from "./lockfile.ts";
import { type Reconciliation, reconcileOwnership } from "./reconcile.ts";

/**
 * Remove what `manifest` no longer accounts for, claim what it resolved to,
 * and record the lockfile. Call only when everything declared has landed.
 * A dry run previews the removals and writes nothing.
 */
export function settleManifest(
  ctx: CommandContext,
  manifest: Manifest,
  resolved: readonly ResolvedSkill[],
): Reconciliation {
  const names = new Set(resolved.map((skill) => skill.name));
  const reconciled = reconcileOwnership(ctx, manifest, names);
  if (ctx.flags.dryRun || reconciled.manifestChanged) return reconciled;
  return recordLock(manifest, resolved) ? reconciled : { ...reconciled, manifestChanged: true };
}

/** What a run tells the user about a settlement. */
export interface SettlementReport {
  /** True when a removal aborted, which makes the command exit 1. */
  readonly hasAbortedRemoval: boolean;
  /** Lines to append to the human report. */
  readonly human: readonly string[];
  /** Lines for stderr and for `warnings` in the `--json` result. */
  readonly warnings: readonly string[];
}

export function reportSettlement(settled: Reconciliation, ctx: CommandContext): SettlementReport {
  const warnings = settled.keptForUnverifiedInstallSites.map(
    (name) =>
      `warning: kept \`${safePath(name)}\`, which .crewrc no longer requires: crew could not verify that its install directory is this project's own. Remove it by hand if you want it gone.`,
  );
  if (settled.manifestChanged) {
    warnings.push(
      "warning: .crewrc changed, or could not be read again, while crew was installing, so crew stopped bringing the project in line with it. Check .crewrc and run `crew install` again.",
    );
  }
  return {
    hasAbortedRemoval: settled.removed.some((record) => record.failures.length > 0),
    human: renderDropped(settled.removed, ctx),
    warnings,
  };
}
