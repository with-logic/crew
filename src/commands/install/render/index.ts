/**
 * Human-friendly output for `crew install`.
 *
 * Given the flow result plus a styler, produces the stdout line list.
 * Each skill is rendered as its own block — name in bold, a wrapped
 * description, one row per target with a ✓/✗/- symbol and the install
 * path, then a dim summary. At the bottom, a dim total across all
 * skills attempted.
 */

import { join } from "node:path";
import { baseFor } from "../../../agents/adapter.ts";
import { agentByName } from "../../../agents/registry.ts";
import type { ResolvedSkill } from "../../../core/types.ts";
import type { AlreadyInstalled } from "../../../install/duplicate-rules.ts";
import type { InstallRecord } from "../../../install/perform.ts";
import { firstSentences, plural, shortenHome, wrap } from "../../../util/format.ts";
import type { Styler } from "../../../util/term.ts";
import { formatTotals, formatVersion, renderAgentLine, tallyAgents } from "./helpers.ts";

export interface RenderInstallInput {
  readonly records: readonly InstallRecord[];
  readonly alreadyInstalled: readonly AlreadyInstalled[];
  readonly resolved: readonly ResolvedSkill[];
  readonly dryRun: boolean;
  readonly cwd: string;
  readonly width: number;
}

export function renderInstall(input: RenderInstallInput, style: Styler): string[] {
  const byName = new Map(input.resolved.map((r) => [r.name, r]));
  const lines: string[] = [];
  const dryTag = input.dryRun ? style.dim(" (dry run)") : "";

  if (input.records.length === 0 && input.alreadyInstalled.length > 0) {
    // Every root was already installed — render each as a full block so
    // the user can see exactly where it lives, matching the fresh-install
    // layout but with dim markers.
    let first = true;
    for (const existing of input.alreadyInstalled) {
      if (!first) lines.push("");
      first = false;
      lines.push(
        ...renderAlreadyInstalled(
          existing,
          byName.get(existing.name),
          input.cwd,
          input.width,
          style,
        ),
      );
    }
    return lines;
  }

  // Header: "Installing <name>" for a single skill, "Installing N skills" for more.
  const headerSubjects = input.records.map((r) => r.name);
  const header =
    headerSubjects.length === 1
      ? `Installing ${headerSubjects[0]}${dryTag}`
      : `Installing ${plural(headerSubjects.length, "skill")}${dryTag}`;
  lines.push(style.bold(header));

  // Already-installed short-circuits render above the per-skill blocks so the
  // user sees "you already had this" before the fresh work.
  for (const existing of input.alreadyInstalled) {
    lines.push("");
    lines.push(
      ...renderAlreadyInstalled(existing, byName.get(existing.name), input.cwd, input.width, style),
    );
  }

  for (const record of input.records) {
    lines.push("");
    lines.push(...renderRecord(record, byName.get(record.name), input.cwd, input.width, style));
  }

  const totals = tallyAgents(input.records);
  if (totals.total > 0) {
    lines.push("");
    lines.push(style.dim(formatTotals(totals)));
  }

  return lines;
}

function renderAlreadyInstalled(
  existing: AlreadyInstalled,
  resolved: ResolvedSkill | undefined,
  cwd: string,
  width: number,
  style: Styler,
): string[] {
  const lines: string[] = [];
  const tagParts: string[] = [style.dim("(already installed)")];
  const version = formatVersion(existing.ref, existing.resolvedSha);
  if (version) tagParts.push(style.dim(`· ${version}`));
  // Match `renderRecord`'s scope-tag shape: two leading spaces
  // inside `style.dim` so color markup brackets the whole tag.
  const scopeTag = existing.scope === "project" ? style.dim(`  in ${shortenHome(cwd)}`) : "";
  lines.push(`  ${style.bold(existing.name)} ${tagParts.join(" ")}${scopeTag}`);
  if (resolved?.frontmatter.description) {
    const desc = firstSentences(resolved.frontmatter.description, 200);
    const indent = "    ";
    for (const l of wrap(desc, Math.max(40, width - indent.length))) {
      lines.push(style.dim(`${indent}${l}`));
    }
  }
  // One dim-marker row per agent — matches the newly-installed block's
  // shape so the user can read both side-by-side at a glance.
  for (const agentName of existing.agents) {
    const adapter = agentByName(agentName);
    const installPath = adapter
      ? shortenHome(join(baseFor(adapter, existing.scope, cwd), existing.name))
      : "";
    const pathSuffix = installPath ? `${style.dim("→")} ${style.dim(installPath)}` : "";
    const parts = [style.symbol("muted"), agentName, pathSuffix].filter((s) => s.length > 0);
    lines.push(`    ${parts.join(" ")}`);
  }
  return lines;
}

function renderRecord(
  record: InstallRecord,
  resolved: ResolvedSkill | undefined,
  cwd: string,
  width: number,
  style: Styler,
): string[] {
  const lines: string[] = [];
  // Scope is only annotated for project installs — user scope is the
  // default and showing `[user]` everywhere is noise. For a project
  // install, surface where it landed.
  const scopeTag = record.scope === "project" ? style.dim(`  in ${shortenHome(cwd)}`) : "";
  lines.push(`  ${style.bold(record.name)}${scopeTag}`);
  if (resolved?.frontmatter.description) {
    const desc = firstSentences(resolved.frontmatter.description, 200);
    const indent = "    ";
    for (const l of wrap(desc, Math.max(40, width - indent.length))) {
      lines.push(style.dim(`${indent}${l}`));
    }
  }
  for (const t of record.agents) {
    lines.push(`    ${renderAgentLine(record.name, t, record.scope, cwd, style)}`);
  }
  return lines;
}
