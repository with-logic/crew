/**
 * Manifest ownership (§9.2): the skills a project manifest declares belong
 * to it, and a skill it stops declaring is removed.
 *
 * Ownership is the `manifest` flag on a state entry. It is claimed for
 * every skill the manifest resolved to — dependencies included — and it is
 * what separates a dropped skill from one somebody installed in the
 * project by hand, which a manifest never removes.
 */

import { entryTargetBases } from "../../agents/target-lock/bases.ts";
import { withTargetLocks } from "../../agents/target-lock/index.ts";
import type { StateEntry, StateFile } from "../../core/types.ts";
import { garbageCollectAutoTaps } from "../../maintenance/auto-taps.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import type { CommandContext } from "../types.ts";
import { removeOne, type UninstallRecord } from "../uninstall/core.ts";

/**
 * Bring ownership at `root` in line with `declared`, the names the manifest
 * resolved to. Returns one record per skill removed for no longer being
 * declared. A dry run reports the removals and writes nothing.
 */
export function syncManifestOwnership(
  ctx: CommandContext,
  root: string,
  declared: ReadonlySet<string>,
): readonly UninstallRecord[] {
  if (ctx.flags.dryRun) return removeDropped(readState(ctx.home), ctx, root, declared).records;
  return withStateLock(() => {
    const claimed = claimDeclared(readState(ctx.home), root, declared);
    const { state, records } = removeDropped(claimed, ctx, root, declared);
    writeState(state, ctx.home);
    // A dropped line may have been the last use of its auto tap (§16.5).
    if (records.length > 0) garbageCollectAutoTaps(state, ctx.home);
    return records;
  }, ctx.home);
}

const isAt = (entry: StateEntry, root: string): boolean =>
  entry.scope === "project" && entry.project_root === root;

/** Mark every declared skill installed at `root` as manifest-owned. */
function claimDeclared(state: StateFile, root: string, declared: ReadonlySet<string>): StateFile {
  return {
    schema_version: 1,
    installations: state.installations.map((entry) =>
      isAt(entry, root) && declared.has(entry.name) ? { ...entry, manifest: true } : entry,
    ),
  };
}

/** Uninstall every manifest-owned skill at `root` that is no longer declared. */
function removeDropped(
  initial: StateFile,
  ctx: CommandContext,
  root: string,
  declared: ReadonlySet<string>,
): { readonly state: StateFile; readonly records: readonly UninstallRecord[] } {
  const dropped = initial.installations.filter(
    (entry) => isAt(entry, root) && entry.manifest === true && !declared.has(entry.name),
  );
  const remove = (unavailableBases?: ReadonlySet<string>) => {
    let state = initial;
    const records: UninstallRecord[] = [];
    for (const entry of dropped) {
      const subject = { raw: entry.name, name: entry.name, entries: [entry] };
      const removal = removeOne(state, subject, ctx, false, null, false, unavailableBases);
      state = removal.updatedState;
      records.push(removal.rec);
    }
    return { state, records };
  };
  if (ctx.flags.dryRun || dropped.length === 0) return remove();
  return withTargetLocks(entryTargetBases(dropped, root, false), (_failures, unavailable) =>
    remove(unavailable),
  );
}
