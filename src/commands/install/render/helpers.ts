/**
 * Formatting helpers for `crew install`'s human output.
 *
 * Extracted from `./index.ts` to keep that file under the 200-line
 * cap. Each helper is a pure function with no state.
 */

import { join } from "node:path";
import { baseFor } from "../../../agents/adapter.ts";
import { agentByName } from "../../../agents/registry.ts";
import type { InstallRecord, PerAgentResult } from "../../../install/perform.ts";
import { plural, shortenHome } from "../../../util/format.ts";
import type { Styler } from "../../../util/term.ts";

/** Remedy hints shown when a target install fails. Plain English only. */
const AGENT_FAIL_REMEDIES: Record<string, string> = {
  untracked_directory: "something was already there (pass --force to overwrite)",
  customized: "you've edited this version (pass --force to replace it)",
  inconsistent_marker: "a leftover marker doesn't match (pass --force to replace)",
  name_conflict: "a different skill already owns this name",
  invalid_skill: "the skill's SKILL.md isn't valid",
  source_unreachable: "couldn't reach the source",
};

export function renderAgentLine(
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

export interface Totals {
  installed: number;
  upToDate: number;
  failed: number;
  total: number;
}

export function tallyAgents(records: readonly InstallRecord[]): Totals {
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

export function formatTotals(totals: Totals): string {
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
export function formatVersion(ref: string | null, sha: string | null): string {
  const shortSha = sha ? sha.slice(0, 8) : null;
  if (ref && shortSha && ref !== sha) return `${ref} @ ${shortSha}`;
  if (shortSha) return shortSha;
  if (ref) return ref;
  return "";
}
