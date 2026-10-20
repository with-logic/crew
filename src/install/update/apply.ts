/**
 * Stage and reinstall one entry from its acquired tree (§10.1 steps 3c–3e).
 * Split from `./entry.ts` (200-line cap), which decides whether an entry
 * needs this at all.
 */

import type { StateEntry, TapConfig } from "../../core/types.ts";
import { hashDirectory } from "../../hash/content.ts";
import { loadSkill } from "../../skill/load.ts";
import type { AcquiredTap } from "../../sources/acquire/index.ts";
import { stageIntoStore } from "../../sources/store.ts";
import { unreadablePathError } from "../../util/errno.ts";
import { reinstallIntoAgents } from "./reinstall.ts";
import type { InternalOutcome } from "./types.ts";

/** What `applyUpdate` needs beyond the entry and its tree. */
export interface ApplyRun {
  readonly home: string;
  readonly force: boolean;
  readonly entryCwd: string;
  readonly dryRun: boolean;
  /**
   * Reinstall at an unchanged commit or content: a forced pinned entry,
   * or one re-expansion relocated (§10.1, C-UPD-37), whose marker's
   * `path` must follow.
   */
  readonly reinstallAnyway: boolean;
}

/** Stage and reinstall `entry` from `skillPath`, unless nothing moved. */
export function applyUpdate(
  entry: StateEntry,
  acquired: Pick<AcquiredTap, "resolvedSha" | "pinned">,
  // Exists: tap re-expansion marks tracked children gone upstream, and
  // `withAcquiredSkill` raises `no_skills_found`/`invalid_ref` (soft
  // `source_gone`, in `./entry.ts`) for the rest.
  skillPath: string,
  tap: TapConfig,
  run: ApplyRun,
): InternalOutcome {
  const { home, force, entryCwd, dryRun } = run;
  const newSha = acquired.resolvedSha;

  if (entry.pinned && !force && newSha !== null && newSha !== entry.resolved_sha) {
    return { kind: "skipped", reason: "pinned to tag; upstream moved" };
  }

  const sourceHash = newSha === null ? sourceHashOf(skillPath) : undefined;
  if (newSha === entry.resolved_sha && !run.reinstallAnyway) {
    if (newSha !== null) return { kind: "up_to_date" };
    if (sourceHash === entry.content_hash) return { kind: "up_to_date" };
  }

  const loaded = loadSkill(skillPath);
  if (dryRun) return { kind: "would_update", new_sha: newSha };
  const staged = stageIntoStore(loaded.path, entry.name, newSha, home, sourceHash);
  const perTarget = reinstallIntoAgents({
    entry,
    tap,
    storePath: staged.storePath,
    contentHash: staged.contentHash,
    newSha,
    force,
    entryCwd,
  });
  return {
    kind: "updated",
    new_sha: newSha,
    content_hash: staged.contentHash,
    per_target: perTarget,
  };
}

/**
 * A path source's content hash (§12.1). A folder of it crew can't list is
 * `source_unreachable` naming that folder (§13, C-UPD-40), never a raw
 * filesystem error.
 */
function sourceHashOf(skillPath: string): string {
  try {
    return hashDirectory(skillPath);
  } catch (err) {
    throw unreadablePathError((err as NodeJS.ErrnoException).path ?? skillPath, err, "read");
  }
}
