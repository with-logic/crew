/**
 * `crew list` — show every skill crew is tracking (§5.1).
 *
 * Reads `state.json` (no lock — read-only) and hands the sorted, scope-
 * filtered entries to `./render.ts`. `--scope` is a filter here, not a
 * target: with no flag both scopes are shown; `--scope user` /
 * `--scope project` narrow to that scope. The JSON payload reports the
 * filter in `scope` (`null` when unfiltered) so scripts can tell which
 * view they got.
 */

import type { Scope, StateEntry } from "../../core/types.ts";
import { readState } from "../../state/load.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { renderEmpty, renderList } from "./render.ts";

export function listCommand(ctx: CommandContext): CommandOutput {
  const state = readState(ctx.home);
  const scope: Scope | null = ctx.flags.scopeGiven ? ctx.flags.scope : null;
  const filtered =
    scope === null ? state.installations : state.installations.filter((e) => e.scope === scope);
  const sorted = [...filtered].sort(compareEntries);

  const human =
    sorted.length === 0 ? renderEmpty(scope, ctx.style) : renderList(sorted, scope, ctx.style);

  return {
    exitCode: 0,
    human,
    json: { scope, installations: sorted },
  };
}

/** Name, then scope ("project" before "user"), then project root. */
function compareEntries(a: StateEntry, b: StateEntry): number {
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
  return (a.project_root ?? "").localeCompare(b.project_root ?? "");
}
