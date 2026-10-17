/**
 * Re-attribute state entries onto the incoming tap (§5.4, §16.5).
 *
 * When a skill is already installed from an auto tap and the user
 * installs the same location again through a tap that covers it — the
 * whole repo, say, instead of one subpath — the bytes don't move but
 * the bookkeeping does. The entry's `source` is rewritten to the
 * incoming tap, and the install-site markers follow, since markers are
 * authoritative for `doctor --repair` (§11.1): `./markers.ts`.
 */

import type { StateFile } from "../../core/types.ts";
import { entryKey, installLocationKey } from "../../state/identity.ts";
import type { Reattribution } from "../duplicate-rules/index.ts";

function movesByLocation(
  reattributions: readonly Reattribution[],
): ReadonlyMap<string, Reattribution> {
  const byLocation = new Map<string, Reattribution>();
  for (const r of reattributions) {
    byLocation.set(installLocationKey(r.name, r.scope, r.projectRoot), r);
  }
  return byLocation;
}

/**
 * The moves an install's reinstalls made: those whose entry `state` now
 * attributes to the incoming tap (§5.4). A reinstall that failed on every
 * agent left its entry where it was.
 */
export function movesMade(moves: readonly Reattribution[], state: StateFile): Reattribution[] {
  if (moves.length === 0) return [];
  const byLocation = movesByLocation(moves);
  const made: Reattribution[] = [];
  for (const entry of state.installations) {
    const move = byLocation.get(entryKey(entry));
    if (move !== undefined && entry.source.tap === move.toTap) made.push(move);
  }
  return made;
}

/** Apply the moves of entries an install finds already installed to `state`. */
export function applyReattributions(
  state: StateFile,
  reattributions: readonly Reattribution[],
): StateFile {
  if (reattributions.length === 0) return state;
  const moves = movesByLocation(reattributions);
  return {
    schema_version: 1,
    installations: state.installations.map((entry) => {
      const move = moves.get(entryKey(entry));
      if (!move) return entry;
      // An already-installed entry skips `performInstall`, so it takes a
      // subscription with the move (§10.1.1). `../duplicate-rules/classify.ts`
      // moves a tracking entry only when the move carries its subscription,
      // so keeping the entry's own `tracks_tap` never subscribes it anywhere new.
      return {
        ...entry,
        source: { tap: move.toTap, path: move.toPath },
        ...(move.tracksTap ? { tracks_tap: true } : {}),
      };
    }),
  };
}
