/**
 * Tap-index access for reference resolution (§8.3).
 *
 * Every lookup here honours `TapRoots`: when a reference carried an
 * `@<ref>`, its commit was exported first and the root of that export
 * is what gets indexed, so resolution sees the requested commit rather
 * than the shared clone's checked-out revision (§9 step 3).
 */

import type { TapConfig } from "../../core/types.ts";
import { indexTap, type TapIndex } from "../tap-index.ts";
import type { NonTapNameCandidate, TapRoots } from "./types.ts";

/** Index `tap`, reading from its exported root when one was supplied. */
export function indexTapAt(tap: TapConfig, home: string, roots: TapRoots): TapIndex {
  return indexTap(tap, home, roots[tap.name]);
}

/**
 * Index `tap`, or null when it can't be read. A tap that fails to
 * materialize must not abort resolution across the other taps — the
 * caller is searching for a name and an unreadable tap simply cannot
 * contribute a candidate.
 */
export function safeIndex(tap: TapConfig, home: string, roots: TapRoots): TapIndex | null {
  try {
    return indexTapAt(tap, home, roots);
  } catch {
    return null;
  }
}

/** The skill named `name` inside `tap`, preferring an unnamespaced match. */
export function lookupInTap(
  tap: TapConfig,
  home: string,
  name: string,
  roots: TapRoots,
): NonTapNameCandidate | null {
  const idx = safeIndex(tap, home, roots);
  if (!idx) return null;
  const locs = idx.skills.get(name);
  if (!locs || locs.length === 0) return null;
  // Prefer unnamespaced. If the same name lives in multiple
  // namespaces, a 2-segment ref is ambiguous within the tap; we pick
  // deterministically and rely on 3-segment for true disambiguation.
  const unnamespaced = locs.find((l) => l.namespace === null);
  return { kind: "skill", tap, location: unnamespaced ?? locs[0]! };
}
