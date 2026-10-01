/**
 * `crew uninstall <selector>... | --all` (§7.4).
 *
 * Selectors name installed skills, taps, or namespaces; `--all` selects
 * every skill at the target scope behind a confirmation.
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
import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { StateFile } from "../../core/types.ts";
import { entryKey } from "../../state/identity.ts";
import { readState, writeState } from "../../state/load.ts";
import { withStateLock } from "../../state/lock.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { allTargets, confirmAll } from "./all.ts";
import { removeOne, type UninstallRecord } from "./core.ts";
import { gcAutoTaps } from "./gc.ts";
import { renderUninstall } from "./render.ts";
import { selectedTargets } from "./select.ts";
import { findOrphan } from "./state.ts";

export function uninstallCommand(ctx: CommandContext): CommandOutput {
  const all = Boolean(ctx.flags.extras["all"]);
  if (ctx.positional.length === 0 && !all) {
    throw new CrewError(
      "usage_error",
      "`crew uninstall` needs at least one skill name — run `crew list` to see what's installed, or pass `--all` to remove everything",
    );
  }
  const prune = Boolean(ctx.flags.extras["prune"]);
  const agentFilter = validateAgentFilter(ctx.flags.agent);

  // §14: confirmation precedes the lock; execution re-reads state.
  if (all) confirmAll(ctx, readState(ctx.home));

  // A dry run reads state and reports; it never locks, writes, or GCs.
  const { records, exitCode } = ctx.flags.dryRun
    ? runUninstall(ctx, prune, agentFilter)
    : withStateLock(() => {
        const plan = runUninstall(ctx, prune, agentFilter);
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
interface UninstallResult {
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
function runUninstall(
  ctx: CommandContext,
  prune: boolean,
  agentFilter: readonly string[] | null,
): UninstallResult {
  const records: UninstallRecord[] = [];
  let state = readState(ctx.home);
  const removedRoots: (string | null)[] = [];
  const targets = ctx.flags.extras["all"]
    ? allTargets(ctx, state)
    : selectedTargets(ctx, state, readConfig(ctx.home));
  for (const target of targets) {
    const subject = target.subject;
    const { updatedState, rec, meta } = removeOne(state, subject, ctx, false, agentFilter);
    if (target.kind === "collection") rec.collection = target.collection;
    state = updatedState;
    records.push(rec);
    removedRoots.push(...meta.fullyRemovedRoots);
  }
  if (prune && removedRoots.length > 0) {
    state = pruneOrphans(state, ctx, records, new Set(removedRoots));
  }
  const exitCode = records.some((rec) => rec.failures.length > 0) ? 1 : 0;
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
