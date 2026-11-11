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
import { entryKey } from "../../../state/identity.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import type { CommandContext } from "../../types.ts";
import { removeOne, type UninstallRecord } from "../../uninstall/core.ts";
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
  const dropped = state.installations.filter(
    (entry): entry is ProjectEntry =>
      entry.scope === "project" &&
      entry.project_root === projectRoot &&
      entry.manifest_owned === true &&
      !resolvedSkillNames.has(entry.name),
  );
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
  const current = (name: string): StateEntry =>
    state.installations.find(
      (entry) =>
        entry.name === name && entry.scope === "project" && entry.project_root === projectRoot,
    )!;
  for (;;) {
    const removable = [...pending].filter((name) => !neededNames(pending, current).has(name));
    const name = removable.find((n) => current(n).required_by.length === 0) ?? removable[0];
    if (name === undefined) break;
    pending.delete(name);
    const next = current(name);
    const subject = { raw: name, name, entries: [next] };
    const removal = removeOne(state, subject, ctx, false, null, false, unavailableBases);
    state = removal.updatedState;
    records.push(removal.rec);
  }
  return { state: release(state, dropped, shared, [...pending].map(current)), records };
}

/** The pending names that something staying requires, directly or through another needed one. */
function neededNames(
  pending: ReadonlySet<string>,
  current: (name: string) => StateEntry,
): ReadonlySet<string> {
  const needed = new Set<string>();
  let grew: boolean;
  do {
    grew = false;
    for (const name of pending) {
      if (needed.has(name)) continue;
      const requiredByStayer = current(name).required_by.some(
        (dependent) => !pending.has(dependent) || needed.has(dependent),
      );
      if (!requiredByStayer) continue;
      needed.add(name);
      grew = true;
    }
  } while (grew);
  return needed;
}

/**
 * Clear the ownership flag on the dropped entries that are staying for
 * good: the ones sharing a physical target, and any left over because a
 * skill the manifest does not own requires them, directly or through
 * another released skill. An entry held back only by a dependent whose own
 * removal aborted stays owned, so it goes when that dependent finally does.
 */
function release(
  state: StateFile,
  dropped: readonly StateEntry[],
  shared: readonly StateEntry[],
  leftover: readonly StateEntry[],
): StateFile {
  const owned = new Set(dropped.map((entry) => entry.name));
  const released = new Set(shared.map(entryKey));
  for (const entry of shared) owned.delete(entry.name);
  let grew: boolean;
  do {
    grew = false;
    for (const entry of leftover) {
      if (released.has(entryKey(entry))) continue;
      if (entry.required_by.every((name) => owned.has(name))) continue;
      released.add(entryKey(entry));
      owned.delete(entry.name);
      grew = true;
    }
  } while (grew);
  if (released.size === 0) return state;
  return {
    schema_version: 1,
    installations: state.installations.map((entry) => {
      if (!released.has(entryKey(entry))) return entry;
      const { manifest_owned: _released, ...rest } = entry;
      return rest;
    }),
  };
}
