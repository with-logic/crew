/** Rebuild an updated state entry from its per-agent results (§10.1, §11.1). */

import type { StateEntry } from "../../core/types.ts";
import { nowIso } from "../../util/time.ts";

export function rebuildStateEntry(
  entry: StateEntry,
  newSha: string | null,
  contentHash: string,
  nonFailedTargets: string[],
): StateEntry {
  return {
    ...entry,
    resolved_sha: newSha,
    content_hash: contentHash,
    agents: nonFailedTargets.length > 0 ? nonFailedTargets : entry.agents,
    installed_at: nowIso(),
  };
}
