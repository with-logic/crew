/**
 * The pre-checks of the removal sweep (§9.2): which dropped entries are
 * staying, decided before any of them is touched.
 */

import type { StateEntry, StateFile } from "../../../../core/types.ts";
import type { UninstallRecord } from "../../../uninstall/core.ts";
import { areProjectInstallPathsSafeToRemove, type ProjectStateEntry } from "./install-site.ts";

/** Runs the uninstall algorithm (§7.4) for one entry, as a preview when `preview` is true. */
export type Uninstall = (
  state: StateFile,
  entry: StateEntry,
  preview: boolean,
) => { readonly updatedState: StateFile; readonly rec: UninstallRecord };

/** Which dropped entries are staying whatever the order, decided without touching any of them. */
export interface Preflight {
  readonly staying: ReadonlySet<string>;
  /** The aborted previews: one record per entry a safety check would stop. */
  readonly aborted: readonly UninstallRecord[];
  readonly keptForUnverifiedInstallSites: readonly string[];
}

/**
 * Pre-check each dropped entry: the install-site rule, and the uninstall
 * safety checks by way of a preview. An entry that fails either is staying.
 */
export function preflight(
  state: StateFile,
  dropped: readonly ProjectStateEntry[],
  uninstall: Uninstall,
): Preflight {
  const staying = new Set<string>();
  const aborted: UninstallRecord[] = [];
  const keptForUnverifiedInstallSites: string[] = [];
  for (const entry of dropped) {
    if (!areProjectInstallPathsSafeToRemove(entry)) {
      staying.add(entry.name);
      keptForUnverifiedInstallSites.push(entry.name);
      continue;
    }
    const { rec } = uninstall(state, entry, true);
    if (rec.failures.length === 0) continue;
    staying.add(entry.name);
    aborted.push(rec);
  }
  return { staying, aborted, keptForUnverifiedInstallSites };
}
