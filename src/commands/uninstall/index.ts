/**
 * `crew uninstall <name> [<name>...]` (§7.4).
 *
 * Removes each skill from every agent listed in state, then updates
 * state.json. Fails with `not_installed_here` if no state entry exists,
 * unless `--force`.
 *
 * With `--agent <name>` (repeatable), removal is restricted to the
 * named agents only — other agents keep their installs. If the
 * `--agent` filter leaves the entry's `agents` array empty, the
 * entry is removed entirely (same as a default full uninstall).
 *
 * With `--prune` (§7.4 step 5), after removing the named skills, the
 * command recursively uninstalls any remaining skill that was only
 * installed as a transitive dependency (`explicit: false`, empty
 * `required_by`). A partial `--agent` removal that leaves the entry
 * alive does NOT trigger pruning — the skill is still installed, so
 * its dependencies are still required.
 *
 * Per-skill removal and state mutation live in sibling modules
 * (`./core.ts`, `./state.ts`).
 */

import { assertKnownAgents } from "../../agents/validate.ts";
import { readConfig, writeConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import { tapPath } from "../../core/paths.ts";
import type { Config, StateFile } from "../../core/types.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { resolveStateSubject } from "../../state/subjects.ts";
import { rmrf } from "../../util/fs.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { removeOne, type UninstallRecord } from "./core.ts";
import { renderUninstall } from "./render.ts";
import { narrowSubjectToScope } from "./scope.ts";
import { entryKey, findOrphan } from "./state.ts";

export function uninstallCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall` needs at least one skill name — run `crew list` to see what's installed",
    );
  }
  const prune = Boolean(ctx.flags.extras["prune"]);
  const agentFilter = validateAgentFilter(ctx.flags.agent);

  const records: UninstallRecord[] = [];
  let exitCode = 0;

  withStateLock(() => {
    let state = readState(ctx.home);
    const removedRoots: (string | null)[] = [];
    for (const raw of ctx.positional) {
      // §7.4 "Scope": a selector only ever targets one scope.
      const subject = narrowSubjectToScope(
        resolveStateSubject(state, raw),
        ctx.flags.scope,
        ctx.cwd,
        ctx.flags.force,
      );
      const { updatedState, rec, meta } = removeOne(state, subject, ctx, false, agentFilter);
      state = updatedState;
      records.push(rec);
      removedRoots.push(...meta.fullyRemovedRoots);
      if (rec.failures.length > 0) exitCode = 1;
    }
    // §7.4 step 5: pruning is a consequence of a full removal. A forced
    // miss or a surviving partial `--agent` removal frees nothing, so
    // there is nothing to sweep and no root to sweep it in.
    if (prune && removedRoots.length > 0) {
      state = pruneOrphans(state, ctx, records, new Set(removedRoots));
    }
    writeState(state, ctx.home);
    // Auto-tap GC: any auto tap with no remaining state entries is
    // dropped from config and its clone deleted. Registered taps stay.
    gcAutoTaps(state, ctx.home);
  }, ctx.home);

  return { exitCode, human: renderUninstall(records, ctx.style), json: { records } };
}

/**
 * Validate `--agent` against the adapter registry. An unknown agent is
 * a user error — we tell them what's known so they can fix the typo.
 * An empty filter (no `--agent` passed) means "remove from every agent
 * this skill is currently installed in."
 */
function validateAgentFilter(agents: readonly string[]): readonly string[] | null {
  if (agents.length === 0) return null;
  assertKnownAgents(agents);
  return agents;
}

/**
 * Recursively remove any skill that is now an autoremovable orphan:
 * `explicit: false` AND empty `required_by`, restricted to the scope and
 * project roots this run fully removed from (§7.4 step 5). Prune never
 * respects `--agent` filters — when we auto-remove a dep, we remove it
 * fully.
 *
 * TERMINATION: every candidate is recorded in `attempted` BEFORE it is
 * removed, and `findOrphan` skips those keys. The loop therefore runs at
 * most once per entry in state and cannot depend on the entry vanishing —
 * which matters because an orphan whose removal aborts on a safety check
 * deliberately keeps its state entry.
 */
function pruneOrphans(
  state: StateFile,
  ctx: CommandContext,
  records: UninstallRecord[],
  roots: ReadonlySet<string | null>,
): StateFile {
  let current = state;
  const attempted = new Set<string>();
  let orphan = findOrphan(current, ctx.flags.scope, roots, attempted);
  while (orphan) {
    attempted.add(entryKey(orphan));
    const subject = { raw: orphan.name, name: orphan.name, entries: [orphan] };
    const { updatedState, rec } = removeOne(current, subject, ctx, true, null);
    records.push(rec);
    current = updatedState;
    orphan = findOrphan(current, ctx.flags.scope, roots, attempted);
  }
  return current;
}

/**
 * Drop auto taps (registered: false) that no longer back any state
 * entry. Their on-disk clone is deleted. Registered taps are NEVER
 * gc'd by this — only the user's `crew tap remove` removes them.
 */
function gcAutoTaps(state: StateFile, home: string): void {
  const config: Config = readConfig(home);
  const inUse = new Set(state.installations.map((e) => e.source.tap));
  const survivors = config.taps.filter((t) => t.registered || inUse.has(t.name));
  if (survivors.length === config.taps.length) return; // nothing to gc
  const removed = config.taps.filter((t) => !survivors.includes(t));
  writeConfig({ ...config, taps: survivors }, home);
  for (const tap of removed) {
    if (tap.kind === "git") rmrf(tapPath(tap.name, home));
    // Path taps own no clone dir; nothing to delete.
  }
}
