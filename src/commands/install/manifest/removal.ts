/**
 * Removing skills a project manifest no longer accounts for (§9.2).
 *
 * A manifest-owned skill that has left the manifest's resolved install set
 * is uninstalled by the next bare `crew install`. Three cases are kept
 * instead, because removing them would damage something the manifest does
 * not own:
 *
 *   - a skill another installed skill at that location still depends on;
 *   - a skill whose project install directory is physically another
 *     install's — the user-scope one, or another project's (a symlinked
 *     skills directory);
 *   - a skill whose removal aborts on an uninstall safety check (§7.4).
 *
 * The first two are released: they lose the `manifest_owned` flag and stay.
 */

import { entryTargetBases } from "../../../agents/target-lock/bases.ts";
import { withTargetLocks } from "../../../agents/target-lock/index.ts";
import type { StateEntry, StateFile } from "../../../core/types.ts";
import { garbageCollectAutoTaps } from "../../../maintenance/auto-taps.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import type { CommandContext } from "../../types.ts";
import { removeOne, type UninstallRecord } from "../../uninstall/core.ts";
import { neededNames, release } from "./retained.ts";
import { type ProjectEntry, sharesPhysicalTarget } from "./shared-target.ts";

/**
 * Uninstall the manifest-owned skills at `projectRoot` that are not in
 * the manifest's resolved install set. Returns one removal
 * record per skill attempted; a record may describe a completed removal, a
 * dry-run preview, or an attempt a safety check aborted.
 */
export function removeDroppedSkills(
  ctx: CommandContext,
  projectRoot: string,
  resolvedSkillNames: ReadonlySet<string>,
): readonly UninstallRecord[] {
  if (ctx.flags.dryRun)
    return processDroppedEntries(readState(ctx.home), ctx, projectRoot, resolvedSkillNames).records;
  return withStateLock(() => {
    const before = readState(ctx.home);
    const { state, records } = processDroppedEntries(before, ctx, projectRoot, resolvedSkillNames);
    if (state !== before) writeState(state, ctx.home);
    // A dropped line may have been the last use of its auto tap (§16.5).
    if (records.length > 0) garbageCollectAutoTaps(state, ctx.home);
    return records;
  }, ctx.home);
}

interface Outcome {
  readonly state: StateFile;
  readonly records: readonly UninstallRecord[];
}

/**
 * Find the dropped entries and uninstall them. On a normal run this
 * removes skill directories; on a dry run `removeOne` only previews.
 */
function processDroppedEntries(
  state: StateFile,
  ctx: CommandContext,
  projectRoot: string,
  resolvedSkillNames: ReadonlySet<string>,
): Outcome {
  const isDropped = (entry: StateEntry): entry is ProjectEntry => {
    const isHere = entry.scope === "project" && entry.project_root === projectRoot;
    const isOwned = entry.manifest_owned === true;
    const isStillResolved = resolvedSkillNames.has(entry.name);
    return isHere && isOwned && !isStillResolved;
  };
  const dropped = state.installations.filter(isDropped);
  if (dropped.length === 0) return { state, records: [] };
  const run = (unavailable?: ReadonlySet<string>) =>
    removeInOrder(state, dropped, ctx, unavailable);
  if (ctx.flags.dryRun) return run();
  return withTargetLocks(entryTargetBases(dropped, projectRoot, false), (_failures, unavailable) =>
    run(unavailable),
  );
}

/**
 * Remove the dropped entries nothing surviving needs, dependents before
 * what they depend on.
 *
 * An entry is *needed* while something that is staying requires it: a
 * skill the manifest does not own, a dependent whose own removal aborted,
 * or another needed entry. Needed entries are never removed. Among the
 * rest, an entry nothing requires goes first; when every remaining one is
 * required by another — a dependency cycle (§9 step 6) that nothing
 * outside it needs — the cycle is taken apart one member at a time.
 */
function removeInOrder(
  initial: StateFile,
  dropped: readonly ProjectEntry[],
  ctx: CommandContext,
  unavailableBases?: ReadonlySet<string>,
): Outcome {
  let state = initial;
  const records: UninstallRecord[] = [];
  const shared = dropped.filter((entry) => sharesPhysicalTarget(entry, initial));
  const pending = new Set(dropped.filter((e) => !shared.includes(e)).map((e) => e.name));
  const projectRoot = dropped[0]!.project_root;
  // Each pass indexes the location once and computes the needed set once,
  // so a large manifest costs one scan of state per removal, not per pair.
  const entriesHere = (): Map<string, StateEntry> => {
    const byName = new Map<string, StateEntry>();
    for (const entry of state.installations) {
      if (entry.scope === "project" && entry.project_root === projectRoot) {
        byName.set(entry.name, entry);
      }
    }
    return byName;
  };
  for (;;) {
    const here = entriesHere();
    const needed = neededNames(pending, here);
    let name: string | undefined;
    for (const candidate of pending) {
      if (needed.has(candidate)) continue;
      name ??= candidate;
      if (here.get(candidate)!.required_by.length > 0) continue;
      name = candidate;
      break;
    }
    if (name === undefined) break;
    pending.delete(name);
    const subject = { raw: name, name, entries: [here.get(name)!] };
    const removal = removeOne(state, subject, ctx, false, null, false, unavailableBases);
    state = removal.updatedState;
    records.push(removal.rec);
  }
  const here = entriesHere();
  const leftover = [...pending].map((name) => here.get(name)!);
  return { state: release(state, dropped, shared, leftover), records };
}
