/**
 * `crew list` — show every skill crew is tracking (§5.1).
 *
 * Reads `state.json` (no lock — read-only), applies the `--scope`,
 * `--agent`, and `--tap` filters from `./filters.ts`, and hands the
 * sorted survivors to `./render.ts`. Every flag is a filter here, not a
 * target: with no flags everything is shown. The JSON payload reports
 * each filter (`scope`, `agent`, `tap`) so scripts can tell which view
 * they got.
 */

import type { StateEntry } from "../../core/types.ts";
import { readState } from "../../state/load.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { applyListFilters, hasAgentOrTapFilter, readListFilters } from "./filters.ts";
import { renderEmpty, renderList } from "./render.ts";

export function listCommand(ctx: CommandContext): CommandOutput {
  const filters = readListFilters(ctx);
  const state = readState(ctx.home);
  const sorted = applyListFilters(state.installations, filters).sort(compareEntries);

  const human =
    sorted.length === 0
      ? renderEmpty(filters.scope, hasAgentOrTapFilter(filters), ctx.style)
      : renderList(sorted, filters.scope, ctx.style);

  return {
    exitCode: 0,
    human,
    json: { scope: filters.scope, agent: filters.agent, tap: filters.tap, installations: sorted },
  };
}

/** Name, then scope ("project" before "user"), then project root. */
function compareEntries(a: StateEntry, b: StateEntry): number {
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
  return (a.project_root ?? "").localeCompare(b.project_root ?? "");
}
