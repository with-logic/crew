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
import { baseFor } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import type { ResolvedSkill } from "../../core/types.ts";
import type { AlreadyInstalled } from "../../install/duplicate-rules.ts";
import type { InstallRecord, PerAgentResult } from "../../install/perform.ts";
import { firstSentences, plural, shortenHome, wrap } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";

/** Remedy hints shown when a target install fails. Plain English only. */
const AGENT_FAIL_REMEDIES: Record<string, string> = {
  untracked_directory: "something was already there (pass --force to overwrite)",
  customized: "you've edited this version (pass --force to replace it)",
  inconsistent_marker: "a leftover marker doesn't match (pass --force to replace)",
  name_conflict: "a different skill already owns this name",
  invalid_skill: "the skill's SKILL.md isn't valid",
  source_unreachable: "couldn't reach the source",
};

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
  const scopeTag = existing.scope === "project" ? ` ${style.dim(`in ${shortenHome(cwd)}`)}` : "";
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

function renderAgentLine(
  skillName: string,
  result: PerAgentResult,
  scope: "user" | "project",
  cwd: string,
  style: Styler,
): string {
  const name = result.agent;
  if (result.kind === "installed" || result.kind === "up_to_date") {
    const adapter = agentByName(name);
    const installPath = adapter ? shortenHome(join(baseFor(adapter, scope, cwd), skillName)) : "";
    const status = result.kind === "up_to_date" ? style.dim("already up to date") : "";
    const pathSuffix = installPath ? `${style.dim("→")} ${style.dim(installPath)}` : "";
    const parts = [style.symbol("ok"), name, pathSuffix, status].filter((s) => s.length > 0);
    return parts.join(" ");
  }
  const remedy = AGENT_FAIL_REMEDIES[result.error.code] ?? result.error.code.replace(/_/g, " ");
  return `${style.symbol("fail")} ${name}  ${style.red(remedy)}`;
}

interface Totals {
  installed: number;
  upToDate: number;
  failed: number;
  total: number;
}

function tallyAgents(records: readonly InstallRecord[]): Totals {
  const t: Totals = { installed: 0, upToDate: 0, failed: 0, total: 0 };
  for (const r of records) {
    for (const tgt of r.agents) {
      t.total++;
      if (tgt.kind === "installed") t.installed++;
      else if (tgt.kind === "up_to_date") t.upToDate++;
      else t.failed++;
    }
  }
  return t;
}

function formatTotals(totals: Totals): string {
  const parts: string[] = [];
  if (totals.installed > 0) parts.push(plural(totals.installed, "install", "installs"));
  if (totals.upToDate > 0) parts.push(`${totals.upToDate} already up to date`);
  if (totals.failed > 0) parts.push(plural(totals.failed, "failure"));
  return parts.length > 0 ? parts.join(" · ") : "nothing to do";
}

/**
 * Build a human-readable "version" tag for an already-installed skill:
 * the requested ref plus a short SHA when both exist, or just one of
 * them if that's all we have. Returns "" when neither is set (e.g.
 * pure path sources with no git identity).
 */
function formatVersion(ref: string | null, sha: string | null): string {
  const shortSha = sha ? sha.slice(0, 8) : null;
  if (ref && shortSha && ref !== sha) return `${ref} @ ${shortSha}`;
  if (shortSha) return shortSha;
  if (ref) return ref;
  return "";
}
