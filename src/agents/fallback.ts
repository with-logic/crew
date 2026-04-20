/**
 * Fallback-adapter detection (§7.2).
 *
 * The `agent-skills` adapter is a special row in the §7.2 adapter table:
 * it's "detected" only when every other registered adapter's `detect()`
 * returns false. This keeps `AgentAdapter.detect()` self-contained
 * (each adapter's method needs no knowledge of the others) while still
 * giving us fallback semantics at the call sites that compute "is this
 * adapter currently active?" — `computeAgentSet` (install) and the
 * `agents list` command.
 *
 * `agent-skills` itself intentionally returns `false` from `detect()`;
 * the active state is computed here instead.
 */

import type { AgentAdapter } from "./adapter.ts";

/** Name of the fallback adapter, exported to avoid magic strings. */
export const AGENT_SKILLS_NAME = "agent-skills";

/**
 * True iff no non-fallback adapter in `all` detects. The fallback
 * adapter itself is skipped (its raw `detect()` is always false, but
 * skipping makes that invariant explicit and avoids a pointless call).
 */
export function isFallbackDetected(all: readonly AgentAdapter[]): boolean {
  for (const adapter of all) {
    if (adapter.name === AGENT_SKILLS_NAME) continue;
    if (adapter.detect()) return false;
  }
  return true;
}
