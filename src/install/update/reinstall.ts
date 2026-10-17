/**
 * Per-agent reinstall for `crew update` (§10.1 step 3e).
 *
 * Once an entry's new commit is staged into the store, this module runs
 * the install algorithm for every (agent, scope) pair the entry is
 * recorded against and reports one outcome per agent. Extracted from
 * `./entry.ts` so that file stays under the 200-line cap.
 */

import type { AgentAdapter } from "../../agents/adapter.ts";
import { installSkillIntoAgents, isSafetyRefusal } from "../../agents/install.ts";
import type { StateEntry, TapConfig } from "../../core/types.ts";
import { failureCodeOf } from "../../util/errno.ts";
import { adaptersNamed, groupAgentsByDest } from "../dest-groups.ts";
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
  // Shared-path targets install once, but every adapter reports its own outcome.
  const adapters = adaptersNamed(entry.agents);
  for (const group of groupAgentsByDest(adapters, entry.name, entry.scope, entryCwd)) {
    installGroup(group.agents, input, perTarget);
  }
  return perTarget;
}

function installGroup(
  group: readonly AgentAdapter[],
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
    // A safety check refusing to overwrite (§7.3) skips the agent; any other
    // error — an agent folder crew can't write or read — is a failure.
    if (isSafetyRefusal(err)) {
      for (const a of group) perTarget.push({ agent: a.name, kind: "skipped", reason: err.code });
      return;
    }
    const error = { code: failureCodeOf(err), message: (err as Error).message };
    for (const a of group) perTarget.push({ agent: a.name, kind: "failed", error });
  }
}
