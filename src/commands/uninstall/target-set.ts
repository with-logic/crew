/** Complete removal/prune bases at selected install locations (§7.4, §14). */
import { entryTargetBases } from "../../agents/target-lock/bases.ts";
import type { StateFile } from "../../core/types.ts";
import type { UninstallTarget } from "./select.ts";

export function uninstallTargetBases(
  state: StateFile,
  targets: readonly UninstallTarget[],
  prune: boolean,
  cwd: string,
  agentFilter: readonly string[] | null,
) {
  const selected = targets.flatMap((target) => target.subject.entries);
  const filtered = agentFilter
    ? selected.map((entry) => ({
        ...entry,
        agents: entry.agents.filter((agent) => agentFilter.includes(agent)),
      }))
    : selected;
  const locations = new Set(
    selected
      .filter((entry) => !agentFilter || entry.agents.every((agent) => agentFilter.includes(agent)))
      .map((entry) => JSON.stringify([entry.scope, entry.project_root])),
  );
  const lockEntries = prune
    ? [
        ...filtered,
        ...state.installations.filter((entry) =>
          locations.has(JSON.stringify([entry.scope, entry.project_root])),
        ),
      ]
    : filtered;
  return entryTargetBases(lockEntries, cwd, false);
}
