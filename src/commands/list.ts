/**
 * `crew list` — list installed skills from state.
 *
 * Output is one line per (skill, scope). `--json` is required per §5.2.
 */

import { readState } from "../state/load.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function listCommand(ctx: CommandContext): CommandOutput {
  const state = readState(ctx.home);
  const sorted = [...state.installations].sort((a, b) =>
    a.name === b.name ? a.scope.localeCompare(b.scope) : a.name.localeCompare(b.name),
  );
  const human = sorted.map((e) => {
    const sha = e.resolved_sha ? e.resolved_sha.slice(0, 8) : "(path)";
    return `${e.name}@${sha} [${e.scope}] → ${e.targets.join(",")}${e.pinned ? " (pinned)" : ""}`;
  });
  if (sorted.length === 0) human.push("(no skills installed)");
  return {
    exitCode: 0,
    human,
    json: { installations: sorted },
  };
}
