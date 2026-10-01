/**
 * Per-agent reinstall for `crew update` (§10.1 step 3e).
 *
 * Once an entry's new commit is staged into the store, this module runs
 * the install algorithm for every (agent, scope) pair the entry is
 * recorded against and reports one outcome per agent. Extracted from
 * `./entry.ts` so that file stays under the 200-line cap.
 */

import { type AgentAdapter, baseFor } from "../../agents/adapter.ts";
import { installSkillIntoAgents } from "../../agents/install.ts";
import { agentByName } from "../../agents/registry.ts";
import type { CrewError } from "../../core/errors.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import type { PerAgentUpdate } from "./types.ts";

export interface ReinstallInput {
  readonly entry: StateEntry;
  readonly tap: TapConfig;
  readonly storePath: string;
  readonly contentHash: string;
  readonly newSha: string | null;
  readonly force: boolean;
  readonly entryCwd: string;
}

/** Reinstall one staged entry into every agent it is recorded against. */
export function reinstallIntoAgents(input: ReinstallInput): PerAgentUpdate[] {
  const { entry, entryCwd } = input;
  const perTarget: PerAgentUpdate[] = [];
  // Group by resolved install path (§7.2 path sharing) so shared-path
  // targets install once but every adapter reports its own outcome.
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
    installGroup(group, input, perTarget);
  }
  return perTarget;
}

function installGroup(
  group: AgentAdapter[],
  input: ReinstallInput,
  perTarget: PerAgentUpdate[],
): void {
  const { entry, tap, storePath, contentHash, newSha, force, entryCwd } = input;
  try {
    const res = installSkillIntoAgents({
      agents: group,
      scope: entry.scope,
      cwd: entryCwd,
      storePath,
      skillName: entry.name,
      tap,
      tapRelativePath: entry.source.path,
      ref: entry.ref,
      resolvedSha: newSha,
      contentHash,
      force,
    });
    for (const a of group) {
      perTarget.push({
        agent: a.name,
        kind: res.kind === "installed" ? "installed" : "up_to_date",
      });
    }
  } catch (err) {
    // `installSkillIntoAgents` only raises `CrewError` (safety-check aborts).
    const ce = err as CrewError;
    for (const a of group) {
      perTarget.push({ agent: a.name, kind: "skipped", reason: ce.code });
    }
  }
}
