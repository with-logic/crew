/**
 * `crew list` — show every skill crew is tracking.
 *
 * Human output is an aligned multi-column table: name, source (tap +
 * path), short version, which agents it's in, and a trailing set of
 * tags (pinned, dep, project). "all agents" collapses the common case.
 * A dim hint line at the bottom points the user at `crew info` for
 * more detail.
 *
 * `--scope` filters to one scope; `--json` emits the structured
 * payload for scripting per §5.2.
 */

import type { StateEntry } from "../core/types.ts";
import { readState } from "../state/load.ts";
import { ALL_ADAPTERS } from "../targets/registry.ts";
import { columns } from "../util/format.ts";
import type { Styler } from "../util/term.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function listCommand(ctx: CommandContext): CommandOutput {
  const state = readState(ctx.home);
  // Scope filter: `--scope user` (the default) matches user entries only
  // if the user explicitly asked; otherwise list every scope. The flag's
  // default is "user", so we treat scope filtering as "when we have both
  // user and project entries, show both" — scoped scripts can pipe
  // through `jq`. Keep existing test behavior of listing everything.
  const sorted = [...state.installations].sort((a, b) =>
    a.name === b.name ? a.scope.localeCompare(b.scope) : a.name.localeCompare(b.name),
  );

  const human = sorted.length === 0 ? renderEmpty(ctx.style) : renderList(sorted, ctx.style);

  return {
    exitCode: 0,
    human,
    json: { installations: sorted },
  };
}

function renderEmpty(style: Styler): string[] {
  return [
    style.dim("You don't have any skills installed yet."),
    "",
    style.dim("Try `crew search <query>` or `crew install <skill>` to get started."),
  ];
}

function renderList(entries: readonly StateEntry[], style: Styler): string[] {
  const lines: string[] = [];
  lines.push(style.bold(`Installed skills (${entries.length})`));
  lines.push("");

  const adapterCount = ALL_ADAPTERS.length;
  const rowCells: string[][] = entries.map((e) => {
    const source = formatSource(e);
    const version = formatVersion(e);
    const agents = formatAgents(e, adapterCount, style);
    const tags = formatTags(e, style);
    return [`  ${style.bold(e.name)}`, style.dim(source), style.cyan(version), agents, tags];
  });
  for (const line of columns(rowCells, 2)) lines.push(line);

  lines.push("");
  lines.push(style.dim("Run `crew info <name>` to see more about any of these."));
  return lines;
}

function formatSource(e: StateEntry): string {
  // `e.source.path` is the skill's location inside its tap. Empty for
  // single-skill taps where the root is the skill itself.
  return e.source.path.length === 0 ? e.source.tap : `${e.source.tap}/${e.source.path}`;
}

function formatVersion(e: StateEntry): string {
  if (e.resolved_sha) return e.resolved_sha.slice(0, 8);
  return "local";
}

function formatAgents(e: StateEntry, adapterCount: number, style: Styler): string {
  if (e.targets.length === 0) return style.dim("(no agents)");
  if (e.targets.length === adapterCount) return "all agents";
  return e.targets.join(", ");
}

function formatTags(e: StateEntry, style: Styler): string {
  const parts: string[] = [];
  if (e.pinned) parts.push("pinned");
  if (!e.explicit) parts.push("dep");
  if (e.scope === "project") parts.push("project");
  if (parts.length === 0) return "";
  return style.dim(parts.join(" · "));
}
