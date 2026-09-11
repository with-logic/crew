/**
 * Re-install an updated skill into every agent its state entry lists
 * (§10.1 step 3e).
 *
 * Adapters are grouped by resolved install path (§7.2 path sharing) so
 * shared-path targets install once while every adapter still reports
 * its own outcome. Per-group failures are recorded as `skipped` with
 * the error code, never thrown — update's error isolation rule.
 */

import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { installSkillIntoAgents } from "../../agents/install.ts";
import { agentByName } from "../../agents/registry.ts";
import type { CrewError } from "../../core/errors.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import type { StoredSkill } from "../../sources/store.ts";
import type { PerAgentUpdate } from "./types.ts";

export function reinstallIntoAgents(args: {
  readonly entry: StateEntry;
  readonly entryCwd: string;
  readonly tap: TapConfig;
  readonly staged: StoredSkill;
  readonly newSha: string | null;
  readonly force: boolean;
}): PerAgentUpdate[] {
  const { entry, entryCwd, tap, staged, newSha, force } = args;
  const perTarget: PerAgentUpdate[] = [];
  const groups = new Map<string, AgentAdapter[]>();
  for (const targetName of entry.agents) {
    const adapter = agentByName(targetName);
    if (!adapter) continue;
    const base = baseFor(adapter, entry.scope, entryCwd);
    if (base === "") continue;
    const dest = `${base}/${entry.name}`;
    const existing = groups.get(dest);
    if (existing) existing.push(adapter);
    else groups.set(dest, [adapter]);
  }
  for (const group of groups.values()) {
    try {
      const res = installSkillIntoAgents({
        agents: group,
        scope: entry.scope,
        cwd: entryCwd,
        storePath: staged.storePath,
        skillName: entry.name,
        tap,
        tapRelativePath: entry.source.path,
        ref: entry.ref,
        resolvedSha: newSha,
        contentHash: staged.contentHash,
        force,
      });
      for (const a of group) {
        perTarget.push({
          agent: a.name,
          kind: res.kind === "installed" ? "installed" : "up_to_date",
        });
      }
    } catch (err) {
      const ce = err as CrewError;
      for (const a of group) {
        perTarget.push({ agent: a.name, kind: "skipped", reason: ce.code });
      }
    }
  }
  return perTarget;
}
