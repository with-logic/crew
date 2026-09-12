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
import type { AutoupdateRepair } from "./autoupdate.ts";
import type { Finding } from "./checks.ts";
import { isRepairable, isRepairableCode, repairableCount } from "./repairable.ts";

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
  repairs: readonly AutoupdateRepair[] = [],
): string[] {
  if (findings.length === 0) {
    return [
      `${style.symbol("ok")} ${style.bold("Everything looks good.")}`,
      ...(opts.verify
        ? []
        : [style.dim("  Run `crew doctor --verify` for a thorough check (slower).")]),
    ];
  }

  if (opts.applied) return renderRepaired(findings, repairs, style);

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
      // On a repair preview, say per cluster whether this is one of
      // the findings the run would address. The trailing count alone
      // tells the user how many, never which.
      const fixable = opts.dryRun
        ? style.dim(isRepairableCode(code) ? "  — would be repaired" : "  — needs you")
        : "";
      lines.push(`    ${sym} ${label}${qty}${fixable}`);
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

/**
 * Post-repair summary. Scheduler reconciliations (§11.2 check 7) get
 * their own lines because, unlike the state rebuild, they can fail
 * independently and the user needs to know which direction was taken.
 *
 * "Addressed" counts only the repairable classes: a run that leaves
 * `customized` or `missing_project_root` behind must say so rather
 * than implying it fixed everything it found.
 */
function renderRepaired(
  findings: readonly Finding[],
  repairs: readonly AutoupdateRepair[],
  style: Styler,
): string[] {
  const failed = repairs.filter((r) => r.level === "error");
  const headline =
    failed.length === 0
      ? `${style.symbol("ok")} ${style.bold("Repaired what was fixable.")}`
      : `${style.symbol("warn")} ${style.bold(`Repaired what was fixable; ${plural(failed.length, "repair")} failed.`)}`;
  // A failed scheduler repair means its drift finding was not resolved
  // after all, so it doesn't count as addressed.
  const addressed = repairableCount(findings) - failed.length;
  const remaining = findings.length - addressed;
  const lines = [headline, style.dim(`  ${plural(addressed, "finding")} addressed`)];
  if (remaining > 0) {
    lines.push(style.dim(`  ${plural(remaining, "finding")} left for you — rerun \`crew doctor\``));
  }
  for (const r of repairs) {
    const sym = r.level === "error" ? style.symbol("fail") : style.symbol("ok");
    lines.push(`  ${sym} ${r.level === "error" ? style.red(r.message) : style.dim(r.message)}`);
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
