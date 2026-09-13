/**
 * Tap-index lookup helpers used while resolving a `TapSource` (§8.3).
 *
 * Separated from `./index.ts`, which owns the segment-shape resolution
 * rules, so both stay within the project's file-size cap. These two
 * functions are the only place resolution touches a tap's built index.
 */

import type { TapConfig } from "../../core/types.ts";
import { indexTap, type TapIndex } from "../tap-index.ts";
import type { NonTapNameCandidate } from "./index.ts";

/**
 * Find `name` in `tap`'s index, or null if the tap has no such skill
 * (or can't be indexed at all).
 */
export function lookupInTap(
  tap: TapConfig,
  home: string,
  name: string,
): NonTapNameCandidate | null {
  const idx = safeIndex(tap, home);
  if (!idx) return null;
  const locs = idx.skills.get(name);
  if (!locs || locs.length === 0) return null;
  // Prefer unnamespaced. If the same name lives in multiple
  // namespaces, a 2-segment ref is ambiguous within the tap; we pick
  // deterministically and rely on 3-segment for true disambiguation.
  const unnamespaced = locs.find((l) => l.namespace === null);
  return { kind: "skill", tap, location: unnamespaced ?? locs[0]! };
}

/**
 * Index a tap, treating any failure (missing clone, malformed layout)
 * as "no matches" — a broken tap must not abort resolution across the
 * other configured taps.
 */
export function safeIndex(tap: TapConfig, home: string): TapIndex | null {
  try {
    return indexTap(tap, home);
  } catch {
    return null;
  }
}
