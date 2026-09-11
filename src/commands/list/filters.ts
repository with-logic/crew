/**
 * Row filters for `crew list` (§5.1 "`crew list` agent and tap filters").
 *
 * `--scope`, `--agent`, and `--tap` all narrow which state entries are
 * shown; they compose. Unknown agent or tap names are usage errors so a
 * typo doesn't silently produce an empty list.
 */

import { assertKnownAgents } from "../../agents/validate.ts";
import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { Scope, StateEntry } from "../../core/types.ts";
import type { CommandContext } from "../types.ts";

export interface ListFilters {
  readonly scope: Scope | null;
  readonly agent: readonly string[];
  readonly tap: string | null;
}

/** Read and validate the filters from the parsed flags. */
export function readListFilters(ctx: CommandContext): ListFilters {
  const scope: Scope | null = ctx.flags.scopeGiven ? ctx.flags.scope : null;
  assertKnownAgents(ctx.flags.agent);
  const agent = ctx.flags.agent;
  const rawTap = ctx.flags.extras["tap"];
  const tap = typeof rawTap === "string" ? validateTap(rawTap, ctx.home) : null;
  return { scope, agent, tap };
}

/** Keep only entries that satisfy every active filter. */
export function applyListFilters(
  entries: readonly StateEntry[],
  filters: ListFilters,
): StateEntry[] {
  const out: StateEntry[] = [];
  for (const e of entries) {
    if (filters.scope !== null && e.scope !== filters.scope) continue;
    if (filters.agent.length > 0 && !filters.agent.some((a) => e.agents.includes(a))) continue;
    if (filters.tap !== null && e.source.tap !== filters.tap) continue;
    out.push(e);
  }
  return out;
}

/** True if an agent or tap filter is active (scope alone has its own empty message). */
export function hasAgentOrTapFilter(filters: ListFilters): boolean {
  return filters.agent.length > 0 || filters.tap !== null;
}

function validateTap(name: string, home: string): string {
  const config = readConfig(home);
  if (config.taps.some((t) => t.name === name)) return name;
  throw new CrewError(
    "usage_error",
    `\`${name}\` was not found in your list of taps.`,
    { name },
    "This may have been a typo. View your configured taps with `crew tap list`.",
  );
}
