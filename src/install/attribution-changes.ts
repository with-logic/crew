/**
 * What an install changed about the entries it found in state (§5.4,
 * §11.1; C-INST-13o): the tap an entry is attributed to, and whether it
 * tracks that tap. Read off state before and after the install, so every
 * path that changes either is reported the same way — a move made up
 * front, a reinstall's move, a promotion, or a reinstall at another ref
 * that stops tracking.
 */

import type { Scope, StateFile } from "../core/types.ts";
import { entryKey } from "../state/identity.ts";

/** One entry's change; `moved_from` and `tracks_tap` appear only where they changed. */
export interface AttributionChange {
  readonly name: string;
  readonly scope: Scope;
  /** The entry's tap after the install. */
  readonly tap: string;
  /** The tap the entry left, when it moved. */
  readonly moved_from?: string;
  /** Whether the entry now tracks its tap, when that changed. */
  readonly tracks_tap?: boolean;
}

/** The changes between `before` and `after` to entries present in both; a new entry is none. */
export function attributionChanges(before: StateFile, after: StateFile): AttributionChange[] {
  const prior = new Map(before.installations.map((e) => [entryKey(e), e]));
  const changes: AttributionChange[] = [];
  for (const entry of after.installations) {
    const was = prior.get(entryKey(entry));
    if (was === undefined) continue;
    const moved = was.source.tap !== entry.source.tap;
    const tracks = entry.tracks_tap === true;
    const tracking = (was.tracks_tap === true) !== tracks;
    if (!(moved || tracking)) continue;
    changes.push({
      name: entry.name,
      scope: entry.scope,
      tap: entry.source.tap,
      ...(moved ? { moved_from: was.source.tap } : {}),
      ...(tracking ? { tracks_tap: tracks } : {}),
    });
  }
  return changes;
}
