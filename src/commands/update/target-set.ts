/** Complete update bases, including every owner in re-expanded tap groups (§10.1, §14). */
import { existsSync } from "node:fs";
import { entryTargetBases } from "../../agents/target-lock/bases.ts";
import type { TargetBase } from "../../agents/target-lock/index.ts";
import type { StateEntry } from "../../core/types.ts";
import { entryIdentity } from "../../state/collections/index.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import type { LockedPlanInput } from "./locked-plan.ts";
import { reexpandSelectionFor } from "./selection.ts";

export function updateTargetBatch(input: LockedPlanInput): {
  readonly bases: readonly TargetBase[];
  readonly missingProjectRoots: ReadonlySet<string>;
} {
  const selected = reexpandSelectionFor(input.subjects, input.initialSelected);
  const groups = new Map<string, StateEntry[]>();
  for (const entry of input.state.installations) {
    const key = JSON.stringify([entry.source.tap, entry.scope, entry.project_root, entry.ref]);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const entries = [...input.initialSelected];
  for (const group of groups.values()) {
    if (!group.some((entry) => entry.tracks_tap === true)) continue;
    if (
      selected !== null &&
      !group.some(
        (entry) =>
          selected.tapNames.has(entry.source.tap) ||
          selected.memberIdentities.has(entryIdentity(entry)),
      )
    )
      continue;
    entries.push(...group);
  }
  // §10.1: a missing project remains skipped; preparing targets must not recreate it.
  const available: StateEntry[] = [];
  const missingProjectRoots = new Set<string>();
  for (const entry of entries) {
    if (entry.scope === "project") {
      if (!hasUsableProjectRoot(entry)) continue;
      if (!existsSync(entry.project_root)) {
        missingProjectRoots.add(entry.project_root);
        continue;
      }
    }
    available.push(entry);
  }
  return {
    bases: entryTargetBases(available, input.ctx.cwd, true),
    missingProjectRoots,
  };
}
