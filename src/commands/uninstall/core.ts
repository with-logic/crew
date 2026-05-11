/**
 * Core removal primitives for `crew uninstall`.
 *
 * `removeOne` takes a state snapshot and a single skill name, runs the
 * per-target uninstall, and returns the updated state plus a record of
 * what happened. The command entry point (`./index.ts`) orchestrates
 * the loop over positional args and optional pruning.
 */

import { type AgentAdapter, baseFor, cwdForEntry } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import { uninstallSkillFromAgents } from "../../agents/uninstall.ts";
import { CrewError } from "../../core/errors.ts";
import type { StateEntry, StateFile } from "../../core/types.ts";
import type { StateSubject } from "../../state/subjects.ts";
import type { CommandContext } from "../types.ts";
import { dropScopedEntryAndUpdateRequiredBy, reduceEntryAgents } from "./state.ts";

export interface UninstallRecord {
  name: string;
  removedFrom: string[];
  absentFrom: string[];
  failures: { agent: string; error: { code: string; message: string } }[];
  /** True if the removal was driven by `--prune`, not by a direct command-line arg. */
  pruned?: boolean;
  /** True if the state entry still survives after this call (partial --agent removal). */
  partial?: boolean;
}

/**
 * Remove one named skill. If `agentFilter` is null, removes from every
 * agent the skill is on (full uninstall). If non-null, removes only
 * from the named agents; the state entry survives with a reduced
 * `agents` list if any remain.
 */
export function removeOne(
  state: StateFile,
  subject: string | StateSubject,
  ctx: CommandContext,
  pruned: boolean,
  agentFilter: readonly string[] | null,
): { updatedState: StateFile; rec: UninstallRecord } {
  const name = typeof subject === "string" ? subject : subject.name;
  const entries =
    typeof subject === "string"
      ? state.installations.filter((e) => e.name === name)
      : subject.entries;
  const errorName = typeof subject === "string" ? subject : subject.raw;
  const rec: UninstallRecord = {
    name,
    removedFrom: [],
    absentFrom: [],
    failures: [],
    ...(pruned ? { pruned: true } : {}),
  };
  if (entries.length === 0) {
    if (!(ctx.flags.force || pruned)) {
      throw new CrewError(
        "not_installed_here",
        `\`${errorName}\` isn't in Homecrew's state — nothing to remove`,
        { name: errorName },
      );
    }
    return { updatedState: state, rec };
  }
  // Per-entry processing: each (skill, scope) pair potentially touches
  // a different subset of agents.
  let nextState = state;
  let anySurvives = false;
  for (const entry of entries) {
    const agentsToRemove = agentFilter
      ? entry.agents.filter((t) => agentFilter.includes(t))
      : entry.agents;
    removeFromAgents(entry, agentsToRemove, name, ctx, rec);
    const remainingAgents = entry.agents.filter((t) => !agentsToRemove.includes(t));
    if (remainingAgents.length > 0) {
      nextState = reduceEntryAgents(nextState, name, entry.scope, remainingAgents);
      anySurvives = true;
    } else {
      nextState = dropScopedEntryAndUpdateRequiredBy(nextState, name, entry.scope);
    }
  }
  if (anySurvives) rec.partial = true;
  return { updatedState: nextState, rec };
}

/**
 * Run the uninstall algorithm for the specified target subset of an
 * entry. Adapters are grouped by resolved install path (path sharing,
 * §7.2): one call per `dest`, detaching every adapter in the group at
 * once. The per-adapter outcome is derived from the group outcome.
 */
function removeFromAgents(
  entry: StateEntry,
  agentsToRemove: readonly string[],
  name: string,
  ctx: CommandContext,
  rec: UninstallRecord,
) {
  // For project-scope entries, the authoritative install location is
  // the entry's recorded `project_root` — NOT `ctx.cwd`.
  const entryCwd = cwdForEntry(entry, ctx.cwd);
  const groups = new Map<string, AgentAdapter[]>();
  for (const targetName of agentsToRemove) {
    // An unknown target name in state shouldn't happen in normal use
    // but may if state was written by a future crew; skip it
    // silently rather than aborting the whole uninstall. Similarly,
    // adapters that don't support the entry's scope (empty base)
    // wouldn't be in state.agents to begin with, so we don't need
    // a runtime branch for them.
    const adapter = agentByName(targetName);
    if (!adapter) continue;
    const base = baseFor(adapter, entry.scope, entryCwd);
    const dest = `${base}/${name}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  for (const group of groups.values()) {
    try {
      const outcome = uninstallSkillFromAgents({
        agents: group,
        scope: entry.scope,
        cwd: entryCwd,
        skillName: name,
        force: ctx.flags.force,
      });
      if (outcome.kind === "absent") {
        for (const a of group) rec.absentFrom.push(a.name);
      } else {
        // Both "removed" and "detached" count as successful removals
        // of those adapters' ownership — from the user's perspective,
        // the skill is no longer installed for that target.
        for (const a of group) rec.removedFrom.push(a.name);
      }
    } catch (err) {
      const ce = err as CrewError;
      for (const a of group) {
        rec.failures.push({
          agent: a.name,
          error: { code: ce.code ?? "usage_error", message: ce.message },
        });
      }
    }
  }
}
