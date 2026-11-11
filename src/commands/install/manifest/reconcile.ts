/**
 * Reconciling ownership after a bare `crew install` (§9.2): claim what the
 * manifest resolved to, then remove what it no longer accounts for.
 *
 * Both happen under one hold of the state lock, and only if the manifest on
 * disk is still the one this run installed from. Two overlapping installs
 * that read different versions of `.crewrc` would otherwise each sweep away
 * what the other had just claimed.
 */

import { garbageCollectAutoTaps } from "../../../maintenance/auto-taps.ts";
import { claimForManifest, loadManifestFor, type Manifest } from "../../../manifest/index.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext } from "../../types.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { processDroppedEntries, type RemovalOutcome } from "./removal/index.ts";

/** What reconciling did. */
export interface Reconciliation {
  /** One removal record per dropped entry attempted: completed, previewed, or aborted. */
  readonly removed: readonly UninstallRecord[];
  /** Names kept because their install directories are not provably the project's own. */
  readonly keptAsUnsafe: readonly string[];
  /**
   * True when the run could not confirm `.crewrc` is still the manifest it
   * read — it changed, or could not be re-read — so nothing was claimed or
   * removed.
   */
  readonly manifestUnconfirmed: boolean;
}

/** The result when ownership matches the manifest and nothing had to be removed. */
export const IN_STEP_WITH_MANIFEST: Reconciliation = {
  removed: [],
  keptAsUnsafe: [],
  manifestUnconfirmed: false,
};
const MANIFEST_UNCONFIRMED: Reconciliation = {
  ...IN_STEP_WITH_MANIFEST,
  manifestUnconfirmed: true,
};

/**
 * Bring ownership at the manifest's project root in line with
 * `resolvedSkillNames`, its resolved install set: claim what is in it, then
 * remove what the manifest owns that is not. A dry run previews the
 * removals and writes nothing.
 */
export function reconcileOwnership(
  ctx: CommandContext,
  manifest: Manifest,
  resolvedSkillNames: ReadonlySet<string>,
): Reconciliation {
  const request = {
    ctx,
    projectRoot: manifest.projectRoot,
    resolvedSkillNames,
    // Asked again after waiting for target locks and after the pre-checks.
    isStillCurrent: () => !hasChangedOnDisk(manifest),
  };
  if (ctx.flags.dryRun) {
    const preview = processDroppedEntries(readState(ctx.home), request);
    return preview ? reconciliationOf(preview) : MANIFEST_UNCONFIRMED;
  }
  return withStateLock(() => {
    const before = readState(ctx.home);
    const claimed = claimForManifest(before, manifest.projectRoot, resolvedSkillNames);
    const outcome = processDroppedEntries(claimed, request);
    if (outcome === null) return MANIFEST_UNCONFIRMED;
    if (outcome.state !== before) writeState(outcome.state, ctx.home);
    // A dropped line may have been the last use of its auto tap (§16.5).
    if (outcome.records.length > 0) garbageCollectAutoTaps(outcome.state, ctx.home);
    return reconciliationOf(outcome);
  }, ctx.home);
}

/** True unless the manifest governing the project still lists exactly the same references. */
function hasChangedOnDisk(snapshot: Manifest): boolean {
  const identity = (manifest: Manifest | null): string =>
    JSON.stringify([manifest?.file, manifest?.entries.map((entry) => entry.ref)]);
  try {
    return identity(loadManifestFor(snapshot.projectRoot)) !== identity(snapshot);
  } catch {
    return true; // Unreadable or invalid now: not the manifest this run installed from.
  }
}

function reconciliationOf(outcome: RemovalOutcome): Reconciliation {
  return {
    removed: outcome.records,
    keptAsUnsafe: outcome.keptAsUnsafe,
    manifestUnconfirmed: false,
  };
}

/** The warnings a run owes the user about what reconciling did not do. */
export function reconciliationWarnings(reconciled: Reconciliation): string[] {
  const warnings = reconciled.keptAsUnsafe.map(
    (name) =>
      `warning: kept \`${safePath(name)}\`, which .crewrc no longer lists: its install directory is linked or shared, so crew cannot be sure it is this project's own. Remove it by hand if you want it gone.`,
  );
  if (reconciled.manifestUnconfirmed) {
    warnings.push(
      "warning: .crewrc changed, or could not be read again, while crew was installing, so nothing was claimed or removed. Check .crewrc and run `crew install` again.",
    );
  }
  return warnings;
}

/** stderr lines for removals that aborted, for runs whose human output is suppressed (§5.2). */
export function quietRemovalFailures(reconciled: Reconciliation, ctx: CommandContext): string[] {
  if (!ctx.flags.quiet || ctx.flags.json) return [];
  const lines: string[] = [];
  for (const record of reconciled.removed) {
    for (const failure of record.failures) {
      lines.push(
        `error: could not remove \`${safePath(record.name)}\` from ${failure.agent}: ${failure.error.code}`,
      );
    }
  }
  return lines;
}
