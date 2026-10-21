/** Snapshots and rollback for new-child target replacements (§10.1.1). */

import { cpSync, lstatSync, mkdtempSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { AgentAdapter } from "../../agents/adapter.ts";
import { CrewError } from "../../core/errors.ts";
import { rmrf } from "../../util/fs.ts";
import type { NewChildTargetResult } from "../tap-reexpand/types.ts";

interface TargetSnapshot {
  readonly group: readonly AgentAdapter[];
  readonly backup: string | null;
}

export type TargetSnapshots = Map<string, TargetSnapshot>;

/** Snapshot before replacement, leaving the destination's safety checks intact. */
export function snapshotTarget(dest: string, group: readonly AgentAdapter[]): TargetSnapshot {
  if (lstatSync(dest, { throwIfNoEntry: false }) === undefined) return { group, backup: null };
  const backup = mkdtempSync(join(dirname(dest), `.crew-backup-${basename(dest)}-`));
  try {
    cpSync(dest, join(backup, "original"), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
  } catch (err) {
    const cause = err as Error;
    try {
      rmrf(backup);
    } catch (cleanupErr) {
      throw new CrewError(
        "source_unreachable",
        `Could not snapshot ${dest}: ${cause.message}; could not remove partial backup ${backup}: ${(cleanupErr as Error).message}`,
      );
    }
    throw err;
  }
  return { group, backup };
}

/** Restore replaced destinations and remove copies that did not predate this run. */
export function rollbackTargets(
  snapshots: TargetSnapshots,
  perTarget: NewChildTargetResult[],
): void {
  for (const [dest, { group, backup }] of snapshots) {
    let error: { readonly code: string; readonly message: string } | undefined;
    try {
      rmrf(dest);
      if (backup !== null) {
        renameSync(join(backup, "original"), dest);
        rmrf(backup);
      }
    } catch (err) {
      error = {
        code: "source_unreachable",
        message: `Could not roll back ${dest}${backup === null ? "" : ` from ${backup}`}: ${(err as Error).message}`,
      };
    }
    for (const adapter of group) {
      const index = perTarget.findIndex((target) => target.agent === adapter.name);
      const prior = perTarget[index]!;
      if (prior.kind === "failed") {
        if (error)
          perTarget[index] = {
            ...prior,
            error: { ...prior.error, message: `${prior.error.message}; ${error.message}` },
          };
      } else {
        perTarget[index] = error
          ? { agent: adapter.name, kind: "failed", error }
          : { agent: adapter.name, kind: "rolled_back" };
      }
    }
  }
}

/** All installs committed: cleanup errors must not discard the new state (§10.1.1). */
export function discardSnapshots(
  snapshots: TargetSnapshots,
  perTarget: NewChildTargetResult[],
): void {
  for (const { group, backup } of snapshots.values()) {
    if (backup === null) continue;
    try {
      rmrf(backup);
    } catch (err) {
      const cleanup_error = {
        code: "source_unreachable",
        message: `Could not remove rollback backup ${backup}: ${(err as Error).message}`,
      };
      for (const adapter of group) {
        const index = perTarget.findIndex((target) => target.agent === adapter.name);
        // Called only after every install succeeded, before reporting committed state.
        const prior = perTarget[index] as Exclude<NewChildTargetResult, { kind: "failed" }>;
        perTarget[index] = { ...prior, cleanup_error };
      }
    }
  }
}
