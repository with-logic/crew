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
import type { ResolvedSkill } from "../../core/types.ts";
import type { AlreadyInstalled } from "../../install/duplicate-rules.ts";
import type { InstallRecord, PerTargetResult } from "../../install/perform.ts";
import { baseFor } from "../../targets/adapter.ts";
import { adapterByName } from "../../targets/registry.ts";
import { firstSentences, plural, shortenHome, wrap } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";

/** Remedy hints shown when a target install fails. Plain English only. */
const TARGET_FAIL_REMEDIES: Record<string, string> = {
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
    // Every root was already installed — one-liner per skill, nothing more.
    for (const existing of input.alreadyInstalled) {
      lines.push(renderAlreadyInstalled(existing, byName.get(existing.name), style, input.width));
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
    lines.push(renderAlreadyInstalled(existing, byName.get(existing.name), style, input.width));
  }

  for (const record of input.records) {
    lines.push("");
    lines.push(...renderRecord(record, byName.get(record.name), input.cwd, input.width, style));
  }

  const totals = tallyTargets(input.records);
  if (totals.total > 0) {
    lines.push("");
    lines.push(style.dim(formatTotals(totals)));
  }

  return lines;
}

function renderAlreadyInstalled(
  existing: AlreadyInstalled,
  resolved: ResolvedSkill | undefined,
  style: Styler,
  width: number,
): string {
  const bits: string[] = [
    style.symbol("muted"),
    style.bold(existing.name),
    style.dim("already installed"),
  ];
  const version = formatVersion(existing.ref, existing.resolvedSha);
  if (version) bits.push(style.dim(`· ${version}`));
  if (existing.targets.length > 0) {
    bits.push(style.dim(`· in ${existing.targets.join(", ")}`));
  }
  const firstLine = `  ${bits.join(" ")}`;
  if (!resolved?.frontmatter.description) return firstLine;
  const desc = firstSentences(resolved.frontmatter.description, 180);
  const indent = "    ";
  const wrapped = wrap(desc, Math.max(40, width - indent.length));
  return [firstLine, ...wrapped.map((l) => style.dim(`${indent}${l}`))].join("\n");
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
  for (const t of record.targets) {
    lines.push(`    ${renderTargetLine(record.name, t, record.scope, cwd, style)}`);
  }
  return lines;
}

function renderTargetLine(
  skillName: string,
  target: PerTargetResult,
  scope: "user" | "project",
  cwd: string,
  style: Styler,
): string {
  const name = target.target;
  if (target.kind === "installed" || target.kind === "up_to_date") {
    const adapter = adapterByName(name);
    const installPath = adapter ? shortenHome(join(baseFor(adapter, scope, cwd), skillName)) : "";
    const status = target.kind === "up_to_date" ? style.dim("already up to date") : "";
    const pathSuffix = installPath ? `${style.dim("→")} ${style.dim(installPath)}` : "";
    const parts = [style.symbol("ok"), name, pathSuffix, status].filter((s) => s.length > 0);
    return parts.join(" ");
  }
  const remedy = TARGET_FAIL_REMEDIES[target.error.code] ?? target.error.code.replace(/_/g, " ");
  return `${style.symbol("fail")} ${name}  ${style.red(remedy)}`;
}

interface Totals {
  installed: number;
  upToDate: number;
  failed: number;
  total: number;
}

function tallyTargets(records: readonly InstallRecord[]): Totals {
  const t: Totals = { installed: 0, upToDate: 0, failed: 0, total: 0 };
  for (const r of records) {
    for (const tgt of r.targets) {
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
