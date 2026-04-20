/**
 * Determine the active set of agent adapters for an install operation
 * (§9 step 7).
 *
 *   1. Start with every adapter whose `detect()` returns true OR that
 *      appears in `config.forced_agents`.
 *   2. Remove any listed in `config.disabled_agents`.
 *   3. Restrict to `--agent` adapters if any were supplied.
 *   4. If the set is empty, throw `no_agents` (exit 4).
 */

import type { AgentAdapter } from "../agents/adapter.ts";
import { AGENT_SKILLS_NAME, isFallbackDetected } from "../agents/fallback.ts";
import { ALL_AGENTS, agentByName } from "../agents/registry.ts";
import { CrewError } from "../core/errors.ts";
import type { Config } from "../core/types.ts";

/** Compute the active set of agent adapters. */
export function computeAgentSet(
  config: Config,
  restrictTo: readonly string[] = [],
): AgentAdapter[] {
  const unknown = restrictTo.filter((n) => !agentByName(n));
  if (unknown.length > 0) {
    const known = ALL_AGENTS.map((a) => a.name).join(", ");
    throw new CrewError(
      "no_agents",
      `unknown agent${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")} — known agents: ${known}`,
      { unknown },
    );
  }

  let active: AgentAdapter[] = [];
  for (const adapter of ALL_AGENTS) {
    const forced = config.forced_agents.includes(adapter.name);
    // §7.2 fallback — agent-skills is detected iff nobody else is.
    const detected =
      adapter.name === AGENT_SKILLS_NAME ? isFallbackDetected(ALL_AGENTS) : adapter.detect();
    if (!(forced || detected)) {
      continue;
    }
    if (config.disabled_agents.includes(adapter.name)) {
      continue;
    }
    active.push(adapter);
  }
  if (restrictTo.length > 0) {
    const set = new Set(restrictTo);
    active = active.filter((a) => set.has(a.name));
  }
  if (active.length === 0) {
    throw new CrewError(
      "no_agents",
      "no agent coders are active — install one of the supported agents (`crew agents` lists them all) or run `crew agents enable <name>` to force one on",
    );
  }
  return active;
}
