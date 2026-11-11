/**
 * The `--agent` filter of `crew uninstall` (§7.4): which agents a removal
 * is restricted to.
 */

import { ALL_AGENTS, agentByName } from "../../agents/registry.ts";
import { CrewError } from "../../core/errors.ts";

/**
 * Validate `--agent` against the adapter registry. An unknown agent is
 * a user error — we tell them what's known so they can fix the typo.
 * An empty filter (no `--agent` passed) means "remove from every agent
 * this skill is currently installed in."
 */
export function validateAgentFilter(agents: readonly string[]): readonly string[] | null {
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
