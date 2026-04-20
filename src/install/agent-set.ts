/**
 * Determine the active set of target adapters for an install operation
 * (§9 step 7).
 *
 *   1. Start with every adapter whose `detect()` returns true OR that
 *      appears in `config.forced_agents`.
 *   2. Remove any listed in `config.disabled_agents`.
 *   3. Restrict to `--agent` adapters if any were supplied.
 *   4. If the set is empty, throw `no_agents` (exit 4).
 */

import type { AgentAdapter } from "../agents/adapter.ts";
import { ALL_AGENTS, agentByName } from "../agents/registry.ts";
import { CrewError } from "../core/errors.ts";
import type { Config } from "../core/types.ts";

/** Compute the active set of target adapters. */
export function computeAgentSet(
  config: Config,
  restrictTo: readonly string[] = [],
): AgentAdapter[] {
  const unknown = restrictTo.filter((n) => !agentByName(n));
  if (unknown.length > 0) {
    const known = ALL_AGENTS.map((a) => a.name).join(", ");
    throw new CrewError(
      "no_agents",
      `unknown target${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")} — known targets: ${known}`,
      { unknown },
    );
  }

  let active: AgentAdapter[] = [];
  for (const adapter of ALL_AGENTS) {
    const forced = config.forced_agents.includes(adapter.name);
    const detected = adapter.detect();
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
      "no agent coders are active — install Claude Code, Codex CLI, or Gemini CLI, or run `crew agents enable <name>` to force one on",
    );
  }
  return active;
}
