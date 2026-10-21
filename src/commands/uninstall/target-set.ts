/** Complete removal/prune bases at selected install locations (§7.4, §14). */
import { entryTargetBases } from "../../agents/target-lock/bases.ts";
import type { StateFile } from "../../core/types.ts";
import type { UninstallTarget } from "./select.ts";

export function uninstallTargetBases(
  state: StateFile,
  targets: readonly UninstallTarget[],
  prune: boolean,
  cwd: string,
) {
  const selected = targets.flatMap((target) => target.subject.entries);
  const locations = new Set(
    selected.map((entry) => JSON.stringify([entry.scope, entry.project_root])),
  );
  const lockEntries = prune
    ? state.installations.filter((entry) =>
        locations.has(JSON.stringify([entry.scope, entry.project_root])),
      )
    : selected;
  return entryTargetBases(lockEntries, cwd, false);
}
