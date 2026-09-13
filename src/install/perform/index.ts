/**
 * Install every resolved skill into every active agent (§9 steps 9–10).
 *
 * Given a resolved, topologically-ordered install set and the active
 * agents, this function:
 *
 *   - groups agents by resolved install path (path sharing, §7.2);
 *   - runs the per-dest install algorithm (§7.3) once per group;
 *   - records per-agent outcomes for every agent (not per-dest);
 *   - updates `state.json` via upsert under the state lock held by the
 *     caller;
 *   - maintains `explicit` and `required_by` on every entry per §11.1
 *     (explicit never demotes; required_by is rebuilt for every skill
 *     touched by this install);
 *   - returns a structured summary the CLI layer can format.
 *
 * Failures are per-group: a failure in one (skill, dest) group fails
 * every agent in that group but doesn't stop other groups or other
 * skills. The summary decides the exit code.
 */

import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { type InstallOutcome, installSkillIntoAgents } from "../../agents/install.ts";
import type { CrewError } from "../../core/errors.ts";
import type { ResolvedSkill, Scope, StateFile } from "../../core/types.ts";
import { upsertEntry } from "../../state/load.ts";
import type { KeptSource } from "../duplicate-rules/index.ts";
import type { RequiredByMap } from "../resolve/index.ts";
import { buildStateEntry, rebuildRequiredBy } from "./state-entry.ts";

/** Per-(skill, agent) outcome. */
export type PerAgentResult =
  | { kind: "installed"; agent: string }
  | { kind: "up_to_date"; agent: string }
  | { kind: "failed"; agent: string; error: { code: string; message: string } };

/** Per-skill install record. */
export interface InstallRecord {
  readonly name: string;
  readonly scope: Scope;
  readonly agents: readonly PerAgentResult[];
  /** True iff the skill succeeded in at least one agent (or was up-to-date). */
  readonly anySuccess: boolean;
}

/** Result of the whole install operation. */
export interface InstallSummary {
  readonly records: readonly InstallRecord[];
  readonly newState: StateFile;
}

/** Install every resolved skill into every active agent. */
export function performInstall(
  resolved: readonly ResolvedSkill[],
  activeAgents: readonly AgentAdapter[],
  scope: Scope,
  cwd: string,
  startingState: StateFile,
  options: {
    readonly force: boolean;
    readonly dryRun: boolean;
    readonly requiredBy: RequiredByMap;
    /**
     * The full resolve set (including skills that were already
     * installed and thus skipped during the per-agent loop). Used to
     * maintain `required_by` edges on already-installed shared deps —
     * e.g. installing `b` when `a` and `b` both depend on `shared`.
     * Defaults to `resolved` when absent.
     */
    readonly allResolved?: readonly ResolvedSkill[];
    /**
     * Entries whose `source` must survive this install untouched. Set
     * when re-attribution refused to narrow a whole-tap subscription but
     * the skill is installed anyway (`--force`, or a new adapter).
     */
    readonly keepSource?: readonly KeptSource[];
  },
): InstallSummary {
  const records: InstallRecord[] = [];
  let state = startingState;

  for (const skill of resolved) {
    const perAgent: PerAgentResult[] = [];
    const successfulAgents: string[] = [];
    const groups = groupAgentsByDest(activeAgents, skill.name, scope, cwd);
    for (const group of groups) {
      try {
        if (options.dryRun) {
          for (const a of group.agents) {
            perAgent.push({ kind: "installed", agent: a.name });
            successfulAgents.push(a.name);
          }
          continue;
        }
        const outcome: InstallOutcome = installSkillIntoAgents({
          agents: group.agents,
          scope,
          cwd,
          storePath: skill.storePath,
          skillName: skill.name,
          tap: skill.tap,
          tapRelativePath: skill.tapRelativePath,
          ref: skill.ref,
          resolvedSha: skill.resolvedSha,
          contentHash: skill.contentHash,
          force: options.force,
        });
        for (const a of group.agents) {
          perAgent.push({
            kind: outcome.kind === "installed" ? "installed" : "up_to_date",
            agent: a.name,
          });
          successfulAgents.push(a.name);
        }
      } catch (err) {
        const ce = err as CrewError;
        for (const a of group.agents) {
          perAgent.push({
            kind: "failed",
            agent: a.name,
            error: { code: ce.code ?? "usage_error", message: ce.message },
          });
        }
      }
    }
    const anySuccess = successfulAgents.length > 0;
    records.push({ name: skill.name, scope, agents: perAgent, anySuccess });
    if (!options.dryRun && anySuccess) {
      state = upsertEntry(
        state,
        buildStateEntry(skill, scope, successfulAgents, state, options, cwd),
      );
    }
  }

  // Rebuild `required_by` across every skill in the resolve set (both
  // the ones we just installed and any that were already-installed
  // shared deps). Skills outside the resolve set are untouched.
  if (!options.dryRun) {
    const forEdges = options.allResolved ?? resolved;
    state = rebuildRequiredBy(state, forEdges, scope, options.requiredBy, cwd);
  }

  return { records, newState: state };
}

/**
 * Group agents by the filesystem path they'd install into for this
 * skill+scope. Agents that don't support the scope (empty base path)
 * are skipped — they're a silent per-agent no-op.
 */
interface AgentGroup {
  readonly dest: string;
  readonly agents: readonly AgentAdapter[];
}

function groupAgentsByDest(
  agents: readonly AgentAdapter[],
  skillName: string,
  scope: Scope,
  cwd: string,
): AgentGroup[] {
  const groups = new Map<string, AgentAdapter[]>();
  for (const a of agents) {
    const base = baseFor(a, scope, cwd);
    if (base === "") continue;
    const dest = `${base}/${skillName}`;
    const existing = groups.get(dest);
    if (existing) existing.push(a);
    else groups.set(dest, [a]);
  }
  return [...groups.entries()].map(([dest, as]) => ({ dest, agents: as }));
}
