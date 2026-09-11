/**
 * Human output for `crew list` (§5.1).
 *
 * Entries are grouped by skill name. The primary row shows the user-
 * scope install (if any); any project-scope installs get their own
 * indented sub-rows with the project path, so a skill that's installed
 * in three projects plus user scope shows up as one name with four
 * rows under it — the user learns the shape of their install in a
 * glance.
 *
 * Under `--scope project` there is no user row to hang sub-rows on, so
 * every project install is rendered as its own identity row with the
 * `in <path>` location folded into the name column.
 *
 * Columns (aligned): name, source, short version, which agents it's in,
 * a trailing set of tags (pinned, dep). "all agents" collapses the
 * common case. A dim hint line at the bottom points the user at `crew
 * info` for more detail.
 *
 * The source column is a human label, not the raw tap name — see
 * `../source-label.ts` for why an auto tap renders as a reference.
 */

import { ALL_AGENTS } from "../../agents/registry.ts";
import type { Config, Scope, StateEntry } from "../../core/types.ts";
import { columns, shortenHome } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import { sourceLabel } from "../source-label.ts";

export function renderEmpty(scope: Scope | null, rowFiltered: boolean, style: Styler): string[] {
  if (rowFiltered) return [style.dim("No skills match those filters.")];
  if (scope !== null) return [style.dim(`No skills installed at ${scope} scope.`)];
  return [
    style.dim("You don't have any skills installed yet."),
    "",
    style.dim("Try `crew search <query>` or `crew install <skill>` to get started."),
  ];
}

export function renderList(
  entries: readonly StateEntry[],
  scope: Scope | null,
  config: Config,
  style: Styler,
): string[] {
  const lines: string[] = [];
  const grouped = groupByName(entries);
  const suffix = scope === null ? "" : ` at ${scope} scope`;
  lines.push(style.bold(`Installed skills (${grouped.size})${suffix}`));
  lines.push("");

  const rowCells: string[][] = [];
  for (const [, group] of grouped) {
    if (scope === "project") {
      for (const p of group) rowCells.push(projectIdentityRow(p, config, style));
      continue;
    }
    rowCells.push(...groupedRows(group, config, style));
  }
  for (const line of columns(rowCells, 2)) lines.push(line);

  lines.push("");
  lines.push(style.dim("Run `crew info <name>` to see more about any of these."));
  return lines;
}

/** Default view: one identity row per skill, project installs as sub-rows. */
function groupedRows(group: readonly StateEntry[], config: Config, style: Styler): string[][] {
  const adapterCount = ALL_AGENTS.length;
  const user = group.find((e) => e.scope === "user");
  const projects = group.filter((e) => e.scope === "project");
  // The header row always shows the skill name + source/version —
  // the "identity" of the skill itself. When the only installs are
  // project-scope, the header is still the skill name; each project
  // location gets its own sub-row below.
  const identity = user ?? projects[0]!;
  const rows: string[][] = [
    [
      `  ${style.bold(identity.name)}`,
      style.dim(formatSource(identity, config)),
      style.cyan(formatVersion(identity)),
      user ? formatAgents(user, adapterCount, style) : "",
      user ? formatTags(user, style) : "",
    ],
  ];
  for (const p of projects) {
    rows.push([
      `    ${style.dim("└")} ${formatLocation(p, style)}`,
      "",
      "",
      formatAgents(p, adapterCount, style),
      formatTags(p, style),
    ]);
  }
  return rows;
}

/** `--scope project` view: every project install carries its own identity. */
function projectIdentityRow(p: StateEntry, config: Config, style: Styler): string[] {
  return [
    `  ${style.bold(p.name)} ${formatLocation(p, style)}`,
    style.dim(formatSource(p, config)),
    style.cyan(formatVersion(p)),
    formatAgents(p, ALL_AGENTS.length, style),
    formatTags(p, style),
  ];
}

function groupByName(entries: readonly StateEntry[]): Map<string, StateEntry[]> {
  const out = new Map<string, StateEntry[]>();
  for (const e of entries) {
    if (!out.has(e.name)) out.set(e.name, []);
    out.get(e.name)!.push(e);
  }
  return out;
}

function formatLocation(e: StateEntry, style: Styler): string {
  return style.dim(`in ${shortenHome(e.project_root ?? "")}`);
}

function formatSource(e: StateEntry, config: Config): string {
  return sourceLabel(e, config);
}

function formatVersion(e: StateEntry): string {
  if (e.resolved_sha) return e.resolved_sha.slice(0, 8);
  return "local";
}

function formatAgents(e: StateEntry, adapterCount: number, style: Styler): string {
  if (e.agents.length === 0) return style.dim("(no agents)");
  if (e.agents.length === adapterCount) return "all agents";
  return e.agents.join(", ");
}

function formatTags(e: StateEntry, style: Styler): string {
  const parts: string[] = [];
  if (e.pinned) parts.push("pinned");
  if (!e.explicit) parts.push("dep");
  // Scope tag omitted; the `in <path>` location already tells the
  // user it's a project install.
  if (parts.length === 0) return "";
  return style.dim(parts.join(" · "));
}
