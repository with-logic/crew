/**
 * Re-expansion rows for the candidates discovery couldn't name (§10.1.1
 * step 2, C-UPD-18c). Each is a new child crew can't install, so it fails,
 * named by its location in the tap since it has no name — unless an entry
 * of the group is installed from that location: its own update reports it
 * (step 3). Real and dry runs report alike; a namespace-only run reports
 * only what it could have added.
 */

import type { Scope, StateEntry, TapConfig } from "../../core/types.ts";
import type { UnnamedCandidate } from "../unnamed-candidates.ts";
import { withinNamespaces } from "./additions.ts";
import type { TapErrorRow } from "./types.ts";

export interface UnnamedInput {
  readonly unnamed: readonly UnnamedCandidate[];
  readonly members: readonly StateEntry[];
  readonly scope: Scope;
  readonly tap: TapConfig;
  readonly namespaces: ReadonlySet<string> | null;
}

/** One failure row per unnamed candidate the group would have added. */
export function reportUnnamed(input: UnnamedInput): TapErrorRow[] {
  const memberPaths = new Set(input.members.map((m) => m.source.path));
  const rows: TapErrorRow[] = [];
  for (const candidate of input.unnamed) {
    if (memberPaths.has(candidate.tapRelativePath)) continue;
    if (!withinNamespaces(candidate.tapRelativePath, input.namespaces)) continue;
    const { code, message } = candidate.error;
    rows.push({
      name: candidate.tapRelativePath,
      scope: input.scope,
      tap: input.tap.name,
      kind: "tap_error",
      error: { code, message },
    });
  }
  return rows;
}
