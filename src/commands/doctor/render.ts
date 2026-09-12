/**
 * Human-friendly rendering for `crew doctor`.
 *
 * Groups findings under themed headers ("Agents", "State", "Autoupdate",
 * "Config", "Storage") and translates machine codes into plain-English
 * sentences. An all-clean run prints a single check-mark line; anything
 * else ends with a hint pointing at `--repair` when it's the right fix.
 */

import { plural } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import type { Finding } from "./checks.ts";

const CODE_LABELS: Record<string, string> = {
  state_entry_without_marker: "crew's records show an install that isn't on disk",
  marker_without_state: "there's an install on disk crew doesn't remember",
  customized: "local edits detected (won't be overwritten)",
  orphan_store_entry: "a cached skill is no longer referenced",
  agent_missing: "an agent in your state isn't detected anymore",
  missing_project_root: "a project folder is missing",
  autoupdate_not_loaded: "autoupdate is enabled but the background updater isn't loaded",
  autoupdate_unexpectedly_loaded: "autoupdate is off but the background updater is still loaded",
  config_invalid: "~/.crew/config.yaml couldn't be parsed",
};

const CODE_GROUPS: Record<string, string> = {
  state_entry_without_marker: "State",
  marker_without_state: "State",
  customized: "State",
  orphan_store_entry: "Storage",
  agent_missing: "Agents",
  missing_project_root: "State",
  autoupdate_not_loaded: "Autoupdate",
  autoupdate_unexpectedly_loaded: "Autoupdate",
  config_invalid: "Config",
};

const GROUP_ORDER = ["Agents", "State", "Autoupdate", "Config", "Storage", "Other"];

export function renderDoctor(
  findings: readonly Finding[],
  opts: { repair: boolean; verify: boolean; dryRun: boolean; applied: boolean },
  style: Styler,
): string[] {
  if (findings.length === 0) {
    return [
      `${style.symbol("ok")} ${style.bold("Everything looks good.")}`,
      ...(opts.verify
        ? []
        : [style.dim("  Run `crew doctor --verify` for a thorough check (slower).")]),
    ];
  }

  if (opts.applied) {
    const addressed = repairableCount(findings);
    const remaining = findings.length - addressed;
    return [
      `${style.symbol("ok")} ${style.bold("Repaired what was fixable.")}`,
      style.dim(`  ${plural(addressed, "finding")} addressed`),
      ...(remaining > 0
        ? [style.dim(`  ${plural(remaining, "finding")} left for you — rerun \`crew doctor\``)]
        : []),
    ];
  }

  const errors = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warn").length;

  const lines: string[] = [];
  lines.push(
    `${style.symbol(errors > 0 ? "fail" : "warn")} ${style.bold(formatHeadline(errors, warns))}`,
  );
  lines.push("");

  const grouped = groupFindings(findings);
  for (const group of GROUP_ORDER) {
    const items = grouped.get(group);
    if (!items || items.length === 0) continue;
    lines.push(`  ${style.bold(group)}`);
    // Cluster by code so 40 identical orphan markers collapse into a
    // single "40 stale markers" entry with a short sample.
    const byCode = clusterByCode(items);
    for (const [code, cluster] of byCode) {
      const sym = cluster[0]!.level === "error" ? style.symbol("fail") : style.symbol("warn");
      const label = CODE_LABELS[code] ?? code.replace(/_/g, " ");
      const qty = cluster.length > 1 ? style.dim(` (${cluster.length})`) : "";
      lines.push(`    ${sym} ${label}${qty}`);
      // Show the first few messages; for larger clusters summarise.
      const shown = cluster.slice(0, 3);
      for (const f of shown) {
        lines.push(style.dim(`       ${f.message}`));
      }
      if (cluster.length > shown.length) {
        lines.push(style.dim(`       ...and ${cluster.length - shown.length} more`));
      }
    }
    lines.push("");
  }

  // Drop the last trailing blank.
  if (lines[lines.length - 1] === "") lines.pop();

  lines.push("");
  if (opts.dryRun) {
    const fixable = repairableCount(findings);
    lines.push(
      style.dim(
        `Dry run: \`crew doctor --repair\` would address ${plural(fixable, "finding")}. Nothing was changed.`,
      ),
    );
  } else if (isRepairable(findings)) {
    lines.push(style.dim("Run `crew doctor --repair` to fix what's fixable."));
  } else if (errors > 0) {
    // Nothing here is repairable, but an error is not a heads-up —
    // `config_invalid` and friends need the user to act.
    lines.push(style.dim("These need your attention — `--repair` can't fix them."));
  } else {
    lines.push(style.dim("These are heads-ups, not errors — crew keeps working."));
  }
  return lines;
}

function formatHeadline(errors: number, warns: number): string {
  const parts: string[] = [];
  if (errors > 0) parts.push(plural(errors, "problem"));
  if (warns > 0) parts.push(plural(warns, "warning"));
  return `Found ${parts.join(" and ")}.`;
}

function groupFindings(findings: readonly Finding[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  for (const f of findings) {
    const group = CODE_GROUPS[f.code] ?? "Other";
    if (!out.has(group)) out.set(group, []);
    out.get(group)!.push(f);
  }
  return out;
}

function clusterByCode(findings: readonly Finding[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!out.has(f.code)) out.set(f.code, []);
    out.get(f.code)!.push(f);
  }
  return out;
}

/**
 * Codes `--repair` actually fixes, each mapped to the mechanism that
 * fixes it. This is an allowlist on purpose: a new finding code is
 * NOT repairable until someone adds the repair and lists it here, so
 * the preview can never promise a fix that doesn't exist.
 *
 * Deliberately absent:
 *   - `customized`, `agent_missing`, `config_invalid` — need a human.
 *   - `missing_project_root` — `checks.ts` documents that removing a
 *     vanished project's install isn't doctor's job, so it is a
 *     permanent heads-up rather than pending work.
 *   - `autoupdate_not_loaded`, `autoupdate_unexpectedly_loaded` — no
 *     scheduler reconciliation exists here, so claiming them would
 *     promise a fix that never runs. They join this list in the same
 *     change that implements `repairAutoupdateDrift`.
 */
const REPAIRABLE_CODES: Record<string, string> = {
  state_entry_without_marker: "repairState",
  marker_without_state: "repairState",
  orphan_store_entry: "repairState",
};

/** True when `code` is one `crew doctor --repair` can actually fix. */
export function isRepairableCode(code: string): boolean {
  return code in REPAIRABLE_CODES;
}

function isRepairable(findings: readonly Finding[]): boolean {
  return repairableCount(findings) > 0;
}

function repairableCount(findings: readonly Finding[]): number {
  let n = 0;
  for (const f of findings) {
    if (isRepairableCode(f.code)) n++;
  }
  return n;
}
