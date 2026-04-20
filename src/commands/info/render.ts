/**
 * Human-friendly rendering for `crew info`.
 *
 * Two layouts:
 *   - Installed skill: bold name, wrapped description (from the
 *     installed SKILL.md), a tidy metadata block ("from", "version",
 *     "installed", "installed at"), and a trailing hint.
 *   - Uninstalled reference: one block per skill with description,
 *     license, homepage, deps. Multi-skill collections show a header
 *     up top.
 */

import type { StateEntry, TapConfig } from "../../core/types.ts";
import { plural, timeAgo, twoColumnTable, wrap } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";

export interface InstalledInfo {
  readonly entry: StateEntry;
  readonly description: string | null;
}

export interface SkillInfo {
  readonly name: string;
  readonly description: string;
  readonly license: string | null;
  readonly compatibility: string | null;
  readonly homepage: string | null;
  readonly dependencies: readonly string[];
}

export function renderInstalled(info: InstalledInfo, style: Styler, width: number): string[] {
  const { entry, description } = info;
  const lines: string[] = [];
  lines.push(style.bold(entry.name));
  lines.push("");
  if (description && description.length > 0) {
    for (const w of wrap(description, Math.max(40, width - 2))) lines.push(`  ${w}`);
    lines.push("");
  }

  const rows: [string, string][] = [];
  rows.push([style.dim("from"), formatFrom(entry)]);
  rows.push([style.dim("version"), formatVersion(entry, style)]);
  rows.push([style.dim("installed in"), formatTargets(entry)]);
  rows.push([
    style.dim("installed"),
    `${timeAgo(entry.installed_at)} ${style.dim(`(${entry.installed_at.slice(0, 10)})`)}`,
  ]);
  if (entry.pinned) rows.push([style.dim("status"), style.yellow("pinned")]);
  if (!entry.explicit) rows.push([style.dim("status"), style.dim("installed as a dependency")]);
  for (const line of twoColumnTable(rows, 2)) lines.push(`  ${line}`);

  lines.push("");
  lines.push(style.dim(`Run \`crew uninstall ${entry.name}\` to remove it.`));
  return lines;
}

export function renderSkills(
  skills: readonly SkillInfo[],
  tap: TapConfig,
  style: Styler,
  width: number,
): string[] {
  const lines: string[] = [];
  if (skills.length === 0) return [style.dim("No skills here.")];

  if (skills.length === 1) {
    lines.push(...renderOneSkill(skills[0]!, tap, style, width, false));
  } else {
    lines.push(style.bold(`${plural(skills.length, "skill")} in ${tap.name}`));
    lines.push("");
    for (let i = 0; i < skills.length; i++) {
      if (i > 0) lines.push("");
      lines.push(...renderOneSkill(skills[i]!, tap, style, width, true));
    }
  }

  lines.push("");
  const hint =
    skills.length === 1
      ? `Install it with \`crew install ${skills[0]!.name}\`.`
      : `Install any of these with \`crew install <name>\`, or install them all with \`crew install ${tap.name}\`.`;
  lines.push(style.dim(hint));
  return lines;
}

function renderOneSkill(
  skill: SkillInfo,
  tap: TapConfig,
  style: Styler,
  width: number,
  grouped: boolean,
): string[] {
  const lines: string[] = [];
  const indent = grouped ? "  " : "";
  lines.push(`${indent}${style.bold(skill.name)}`);
  if (skill.description) {
    lines.push("");
    for (const w of wrap(skill.description, Math.max(40, width - indent.length - 2))) {
      lines.push(`${indent}  ${w}`);
    }
  }
  const metaRows: [string, string][] = [];
  metaRows.push([style.dim("from"), tap.name]);
  if (skill.license) metaRows.push([style.dim("license"), skill.license]);
  if (skill.compatibility) metaRows.push([style.dim("compatibility"), skill.compatibility]);
  if (skill.homepage) metaRows.push([style.dim("homepage"), skill.homepage]);
  if (skill.dependencies.length > 0) {
    metaRows.push([style.dim("depends on"), skill.dependencies.join(", ")]);
  }
  if (metaRows.length > 0) {
    lines.push("");
    for (const l of twoColumnTable(metaRows, 2)) lines.push(`${indent}  ${l}`);
  }
  return lines;
}

function formatFrom(entry: StateEntry): string {
  // `source.tap` is the collection name; `source.path` is the subpath
  // inside it (empty for single-skill taps).
  if (entry.source.path.length === 0) return entry.source.tap;
  return `${entry.source.tap}/${entry.source.path}`;
}

function formatVersion(entry: StateEntry, style: Styler): string {
  const shortSha = entry.resolved_sha ? entry.resolved_sha.slice(0, 8) : null;
  if (entry.ref && shortSha && entry.ref !== entry.resolved_sha) {
    return `${entry.ref} ${style.dim(`(${shortSha})`)}`;
  }
  if (shortSha) return style.cyan(shortSha);
  if (entry.ref) return entry.ref;
  return style.dim("local");
}

function formatTargets(entry: StateEntry): string {
  if (entry.targets.length === 0) return "(none)";
  return entry.targets.join(", ");
}
