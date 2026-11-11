/**
 * Removing skills a project manifest no longer accounts for (§9.2).
 *
 * A manifest-owned skill that has left the manifest's resolved install set
 * is uninstalled by the next bare `crew install`. Three cases are kept
 * instead, because removing them would damage something the manifest does
 * not own:
 *
 *   - a skill another installed skill at that location still depends on;
 *   - a skill whose project install directory is physically the user-scope
 *     one (a symlinked skills directory);
 *   - a skill whose removal aborts on an uninstall safety check (§7.4).
 *
 * The first two are released: they lose the `manifest_owned` flag and stay.
 */

import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { baseFor } from "../../../agents/adapter.ts";
import { agentByName } from "../../../agents/registry.ts";
import { entryTargetBases } from "../../../agents/target-lock/bases.ts";
import { withTargetLocks } from "../../../agents/target-lock/index.ts";
import type { StateEntry, StateFile } from "../../../core/types.ts";
import { garbageCollectAutoTaps } from "../../../maintenance/auto-taps.ts";
import { entryKey } from "../../../state/identity.ts";
import { readState, writeState } from "../../../state/load.ts";
import { withStateLock } from "../../../state/lock.ts";
import type { CommandContext } from "../../types.ts";
import { removeOne, type UninstallRecord } from "../../uninstall/core.ts";

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
    return plan(readState(ctx.home), ctx, projectRoot, resolvedSkillNames).records;
  return withStateLock(() => {
    const before = readState(ctx.home);
    const { state, records } = plan(before, ctx, projectRoot, resolvedSkillNames);
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

function plan(
  state: StateFile,
  ctx: CommandContext,
  projectRoot: string,
  resolvedSkillNames: ReadonlySet<string>,
): Outcome {
  const dropped = state.installations.filter(
    (entry) =>
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
 * Remove dependents before the skills they depend on. A skill is only
 * removed once nothing left in state requires it, so a dependency of a
 * survivor — a hand-installed skill, or a dependent whose own removal
 * aborted — is never taken away.
 */
function removeInOrder(
  initial: StateFile,
  dropped: readonly StateEntry[],
  ctx: CommandContext,
  unavailableBases?: ReadonlySet<string>,
): Outcome {
  let state = initial;
  const records: UninstallRecord[] = [];
  const aliased = dropped.filter(sharesUserScopeTarget);
  const pending = new Map<string, StateEntry>();
  for (const entry of dropped) if (!aliased.includes(entry)) pending.set(entryKey(entry), entry);
  const current = (key: string): StateEntry =>
    state.installations.find((entry) => entryKey(entry) === key)!;
  for (;;) {
    const key = [...pending.keys()].find((k) => current(k).required_by.length === 0);
    if (key === undefined) break;
    const next = current(key);
    pending.delete(key);
    const subject = { raw: next.name, name: next.name, entries: [next] };
    const removal = removeOne(state, subject, ctx, false, null, false, unavailableBases);
    state = removal.updatedState;
    records.push(removal.rec);
  }
  const leftover = [...pending.keys()].map(current);
  return { state: release(state, dropped, aliased, leftover), records };
}

/**
 * Clear the manifest flag on the dropped entries that are staying for
 * good: the aliased ones, and any left over because a skill the manifest
 * does not own requires them, directly or through another released skill.
 * An entry held back only by a dependent whose own removal aborted stays
 * owned, so it goes when that dependent finally does.
 */
function release(
  state: StateFile,
  dropped: readonly StateEntry[],
  aliased: readonly StateEntry[],
  leftover: readonly StateEntry[],
): StateFile {
  const owned = new Set(dropped.map((entry) => entry.name));
  const released = new Set(aliased.map(entryKey));
  for (const entry of aliased) owned.delete(entry.name);
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

/**
 * True when one of the entry's project install directories is physically
 * the same directory as that agent's user-scope one — a project whose
 * skills directory is a symlink to the user's. Removing "the project's"
 * copy there would delete the user's skill.
 */
function sharesUserScopeTarget(entry: StateEntry): boolean {
  for (const name of entry.agents) {
    const adapter = agentByName(name);
    if (!adapter) continue;
    const project = join(baseFor(adapter, "project", entry.project_root!), entry.name);
    const user = join(baseFor(adapter, "user", entry.project_root!), entry.name);
    if (existsSync(project) && existsSync(user) && realpathSync(project) === realpathSync(user)) {
      return true;
    }
  }
  return false;
}
