/**
 * Agents grouped by the folder they install a skill into (§7.2 path
 * sharing): agents that share a folder install once, and each still
 * counts as installed. An agent with no folder at the scope is no target
 * (a silent per-agent no-op, §7.3), and a recorded name crew no longer
 * knows names no agent.
 */

import { type AgentAdapter, baseFor } from "../agents/adapter.ts";
import { agentByName } from "../agents/registry.ts";
import type { Scope } from "../core/types.ts";

/** One folder a skill installs into, and the agents that share it. */
export interface DestGroup {
  readonly dest: string;
  readonly agents: readonly AgentAdapter[];
}

/** `agents` grouped by the folder each installs `skillName` into at `scope`, in order. */
export function groupAgentsByDest(
  agents: readonly AgentAdapter[],
  skillName: string,
  scope: Scope,
  cwd: string,
): DestGroup[] {
  const groups = new Map<string, AgentAdapter[]>();
  for (const adapter of agents) {
    const base = baseFor(adapter, scope, cwd);
    if (base === "") continue;
    const dest = `${base}/${skillName}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  return [...groups.entries()].map(([dest, shared]) => ({ dest, agents: shared }));
}

/** The adapters `names` name, in order; a name crew doesn't know is passed over. */
export function adaptersNamed(names: readonly string[]): AgentAdapter[] {
  const found: AgentAdapter[] = [];
  for (const name of names) {
    const adapter = agentByName(name);
    if (adapter) found.push(adapter);
  }
  return found;
}
