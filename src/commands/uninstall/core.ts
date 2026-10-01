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

/** What a removal reports regardless of outcome. */
interface UninstallRecordBase {
  name: string;
  removedFrom: string[];
  absentFrom: string[];
  failures: { agent: string; error: { code: string; message: string } }[];
  /** True if the removal was driven by `--prune`, not by a direct command-line arg. */
  pruned?: boolean;
}

/**
 * A record for a removal that left the skill installed somewhere: an
 * `--agent` filter kept agents back, or a safety check aborted and the
 * bytes remain.
 *
 * `partial` and `remainingAgents` are declared together rather than as
 * two independent optionals. §7.4 makes "would be retained" an output
 * obligation, so a record asserting a partial removal without naming
 * who kept the skill would satisfy the type while breaking the
 * contract. Both stay top-level: `remainingAgents` is the field name
 * §7.4 and C-UNINST-19b pin for `--json`.
 */
export type UninstallRecord = UninstallRecordBase &
  (
    | { partial?: undefined; remainingAgents?: undefined }
    | {
        partial: true;
        remainingAgents: string[];
      }
  );

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
  const retained = new Set<string>();
  for (const entry of entries) {
    const agentsToRemove = agentFilter
      ? entry.agents.filter((t) => agentFilter.includes(t))
      : entry.agents;
    const detached = removeFromAgents(entry, agentsToRemove, name, ctx, rec);
    // Retention follows the per-agent OUTCOME, not the request: an
    // agent whose removal aborted on a safety check still has the
    // skill's bytes on disk, so §7.4 obliges us to report it as
    // retained even though the user asked for it to go.
    const remainingAgents = entry.agents.filter((t) => !detached.has(t));
    if (remainingAgents.length > 0) {
      nextState = reduceEntryAgents(nextState, name, entry.scope, remainingAgents);
      // Entries at different scopes can retain different agents; the
      // record reports the union, deduplicated.
      for (const a of remainingAgents) retained.add(a);
    } else {
      nextState = dropScopedEntryAndUpdateRequiredBy(nextState, name, entry.scope);
    }
  }
  if (retained.size > 0) {
    Object.assign(rec, { partial: true, remainingAgents: [...retained].sort() });
  }
  return { updatedState: nextState, rec };
}

/**
 * Run the uninstall algorithm for the specified target subset of an
 * entry. Adapters are grouped by resolved install path (path sharing,
 * §7.2): one call per `dest`, detaching every adapter in the group at
 * once. The per-adapter outcome is derived from the group outcome.
 *
 * Returns the agents whose ownership actually came off — the caller
 * needs the outcome, not the request, to decide what is retained.
 */
function removeFromAgents(
  entry: StateEntry,
  agentsToRemove: readonly string[],
  name: string,
  ctx: CommandContext,
  rec: UninstallRecord,
): ReadonlySet<string> {
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
  const detached = new Set<string>();
  for (const group of groups.values()) {
    try {
      const outcome = uninstallSkillFromAgents({
        agents: group,
        scope: entry.scope,
        cwd: entryCwd,
        skillName: name,
        force: ctx.flags.force,
        dryRun: ctx.flags.dryRun,
      });
      if (outcome.kind === "absent") {
        for (const a of group) rec.absentFrom.push(a.name);
      } else {
        // Both "removed" and "detached" count as successful removals
        // of those adapters' ownership — from the user's perspective,
        // the skill is no longer installed for that target.
        for (const a of group) rec.removedFrom.push(a.name);
      }
      // Absent and removed alike leave no bytes owned by this agent.
      for (const a of group) detached.add(a.name);
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
  return detached;
}
