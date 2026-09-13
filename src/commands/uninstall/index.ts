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

import { ALL_AGENTS, agentByName } from "../../agents/registry.ts";
import { CrewError } from "../../core/errors.ts";
import type { StateFile } from "../../core/types.ts";
import { garbageCollectAutoTaps } from "../../maintenance/auto-taps.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import { resolveStateSubject } from "../../state/subjects.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { removeOne, type UninstallRecord } from "./core.ts";
import { renderUninstall } from "./render.ts";
import { findOrphan } from "./state.ts";

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
    for (const raw of ctx.positional) {
      const subject = resolveStateSubject(state, raw);
      const { updatedState, rec } = removeOne(state, subject, ctx, false, agentFilter);
      state = updatedState;
      records.push(rec);
      if (rec.failures.length > 0) exitCode = 1;
    }
    if (prune) {
      state = pruneOrphans(state, ctx, records);
    }
    writeState(state, ctx.home);
    // Auto-tap GC: any auto tap with no remaining state entries is
    // dropped from config and its clone deleted. Registered taps stay.
    garbageCollectAutoTaps(state, ctx.home);
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
  const unknown = agents.filter((n) => !agentByName(n));
  if (unknown.length > 0) {
    const known = ALL_AGENTS.map((a) => a.name).join(", ");
    throw new CrewError(
      "usage_error",
      `unknown agent${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")} — known agents: ${known}`,
      { unknown },
    );
  }
  return agents;
}

/**
 * Recursively remove any skill that is now an autoremovable orphan:
 * `explicit: false` AND empty `required_by`. Runs until a full pass
 * finds no new orphans. Prune never respects `--agent` filters —
 * when we auto-remove a dep, we remove it fully.
 */
function pruneOrphans(
  state: StateFile,
  ctx: CommandContext,
  records: UninstallRecord[],
): StateFile {
  let current = state;
  let orphan = findOrphan(current);
  while (orphan) {
    const { updatedState, rec } = removeOne(current, orphan.name, ctx, true, null);
    records.push(rec);
    current = updatedState;
    orphan = findOrphan(current);
  }
  return current;
}
