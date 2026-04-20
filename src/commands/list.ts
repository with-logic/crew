/**
 * `crew list` — show every skill crew is tracking.
 *
 * Entries are grouped by skill name. The primary row shows the user-
 * scope install (if any); any project-scope installs get their own
 * indented sub-rows with the project path, so a skill that's installed
 * in three projects plus user scope shows up as one name with four
 * rows under it — the user learns the shape of their install in a
 * glance.
 *
 * Columns (aligned): name, source (tap + path), short version, which
 * agents it's in, a trailing set of tags (pinned, dep). "all agents"
 * collapses the common case. A dim hint line at the bottom points the
 * user at `crew info` for more detail.
 */

import type { StateEntry } from "../core/types.ts";
import { readState } from "../state/load.ts";
import { ALL_ADAPTERS } from "../targets/registry.ts";
import { columns, shortenHome } from "../util/format.ts";
import type { Styler } from "../util/term.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function listCommand(ctx: CommandContext): CommandOutput {
  const state = readState(ctx.home);
  const sorted = [...state.installations].sort((a, b) =>
    a.name === b.name
      ? a.scope === b.scope
        ? (a.project_root ?? "").localeCompare(b.project_root ?? "")
        : a.scope.localeCompare(b.scope) // "project" sorts before "user"
      : a.name.localeCompare(b.name),
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
  const grouped = groupByName(entries);
  lines.push(style.bold(`Installed skills (${grouped.size})`));
  lines.push("");

  const adapterCount = ALL_ADAPTERS.length;
  const rowCells: string[][] = [];
  for (const [, group] of grouped) {
    const user = group.find((e) => e.scope === "user");
    const projects = group.filter((e) => e.scope === "project");
    // The header row always shows the skill name + source/version —
    // the "identity" of the skill itself. When the only installs are
    // project-scope, the header is still the skill name; each project
    // location gets its own sub-row below.
    const identity = user ?? projects[0]!;
    rowCells.push([
      `  ${style.bold(identity.name)}`,
      style.dim(formatSource(identity)),
      style.cyan(formatVersion(identity)),
      user ? formatAgents(user, adapterCount, style) : "",
      user ? formatTags(user, style) : "",
    ]);

    // Sub-rows for each project install (one per project).
    for (const p of projects) {
      const location = style.dim(`in ${shortenHome(p.project_root ?? "")}`);
      rowCells.push([
        `    ${style.dim("└")} ${location}`,
        "",
        "",
        formatAgents(p, adapterCount, style),
        formatTags(p, style),
      ]);
    }
  }
  for (const line of columns(rowCells, 2)) lines.push(line);

  lines.push("");
  lines.push(style.dim("Run `crew info <name>` to see more about any of these."));
  return lines;
}

function groupByName(entries: readonly StateEntry[]): Map<string, StateEntry[]> {
  const out = new Map<string, StateEntry[]>();
  for (const e of entries) {
    if (!out.has(e.name)) out.set(e.name, []);
    out.get(e.name)!.push(e);
  }
  return out;
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
  // Scope tag removed; the sub-row's "in <path>" already tells the
  // user it's a project install.
  if (parts.length === 0) return "";
  return style.dim(parts.join(" · "));
}
