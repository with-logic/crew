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
import { ALL_AGENTS } from "../agents/registry.ts";
import { assertKnownAgents } from "../agents/validate.ts";
import { CrewError } from "../core/errors.ts";
import type { Config } from "../core/types.ts";

/** Compute the active set of agent adapters. */
export function computeAgentSet(
  config: Config,
  restrictTo: readonly string[] = [],
): AgentAdapter[] {
  // `no_agents`, not `usage_error`: an unresolvable restriction here
  // means the install has no targets at all (§13).
  assertKnownAgents(restrictTo, "no_agents");

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
      "no agent coders are active — install one of the supported agents (`crew agents` lists them all) or run `crew agents enable <name>` to force one on",
    );
  }
  return active;
}
