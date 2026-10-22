/** Group adapters by literal install destination, preserving adapter order (§7.2–7.3). */

import { type AgentAdapter, baseFor } from "../agents/adapter.ts";
import type { Scope } from "../core/types.ts";

/**
 * Group agents by the filesystem path they'd install into for this
 * skill+scope. Agents that don't support the scope (empty base path)
 * are skipped — they're a silent per-agent no-op.
 */
interface AgentGroup {
  readonly dest: string;
  readonly agents: readonly AgentAdapter[];
}

export function groupAgentsByDest(
  agents: readonly AgentAdapter[],
  skillName: string,
  scope: Scope,
  cwd: string,
): readonly AgentGroup[] {
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
