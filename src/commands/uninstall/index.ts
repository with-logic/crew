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
 * With `--dry-run` (§7.4), every selector, filter, and safety check
 * runs exactly as it would for real, but nothing is written: the
 * per-agent step reports instead of removing, the command skips the
 * state write and auto-tap GC, and it never takes the state lock —
 * acquiring the lock would itself create `state.json` (§14 reserves
 * the lock for commands that write).
 *
 * Per-skill removal and state mutation live in sibling modules
 * (`./core.ts`, `./state.ts`).
 */

import { ALL_AGENTS, agentByName } from "../../agents/registry.ts";
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

  // A dry run reads state and reports; it never locks, writes, or GCs.
  const { records, exitCode } = ctx.flags.dryRun
    ? planUninstall(ctx, prune, agentFilter)
    : withStateLock(() => {
        const plan = planUninstall(ctx, prune, agentFilter);
        writeState(plan.state, ctx.home);
        // Auto-tap GC: any auto tap with no remaining state entries is
        // dropped from config and its clone deleted. Registered taps stay.
        gcAutoTaps(plan.state, ctx.home);
        return plan;
      }, ctx.home);

  return {
    exitCode,
    human: renderUninstall(records, ctx.flags.dryRun, ctx.style),
    json: { records, dry_run: ctx.flags.dryRun },
  };
}

/** Outcome of walking the selectors: the state that would result, plus per-skill records. */
interface UninstallPlan {
  readonly state: StateFile;
  readonly records: readonly UninstallRecord[];
  readonly exitCode: number;
}

/**
 * Walk every selector (and the `--prune` pass), returning what state
 * would look like afterwards. The per-agent work honours `--dry-run`
 * inside `removeOne`, so this one function drives both the preview and
 * the real removal — they can never disagree about what happens.
 */
function planUninstall(
  ctx: CommandContext,
  prune: boolean,
  agentFilter: readonly string[] | null,
): UninstallPlan {
  const records: UninstallRecord[] = [];
  let exitCode = 0;
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
  return { state, records, exitCode };
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
