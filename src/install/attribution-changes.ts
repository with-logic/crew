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

/** The entry a change is about, and its tap after the install. */
interface ChangedEntry {
  readonly name: string;
  readonly scope: Scope;
  readonly tap: string;
}

/**
 * One entry's change: `moved_from` (the tap it left) when it moved, and
 * `tracks_tap` (whether it now tracks its tap) when that changed — at
 * least one of the two, only where it changed.
 */
export type AttributionChange = ChangedEntry &
  (
    | { readonly moved_from: string; readonly tracks_tap?: boolean }
    | { readonly moved_from?: never; readonly tracks_tap: boolean }
  );

/** The changes between `before` and `after` to entries present in both; a new entry is none. */
export function attributionChanges(before: StateFile, after: StateFile): AttributionChange[] {
  const prior = new Map(before.installations.map((e) => [entryKey(e), e]));
  const changes: AttributionChange[] = [];
  for (const entry of after.installations) {
    const was = prior.get(entryKey(entry));
    if (was === undefined) continue;
    const tapChanged = was.source.tap !== entry.source.tap;
    const tracksNow = entry.tracks_tap === true;
    const trackingChanged = (was.tracks_tap === true) !== tracksNow;
    if (!(tapChanged || trackingChanged)) continue;
    const subject = { name: entry.name, scope: entry.scope, tap: entry.source.tap };
    const tracking = trackingChanged ? { tracks_tap: tracksNow } : {};
    changes.push(
      tapChanged
        ? { ...subject, moved_from: was.source.tap, ...tracking }
        : { ...subject, tracks_tap: tracksNow },
    );
  }
  return changes;
}
