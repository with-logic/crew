/**
 * Tap-index access for reference resolution (§8.3).
 *
 * Every lookup here honours `TapRoots`: when a reference carried an
 * `@<ref>`, its commit was exported first and the root of that export
 * is what gets indexed, so resolution sees the requested commit rather
 * than the shared clone's checked-out revision (§9 step 3).
 */

import type { TapConfig } from "../../core/types.ts";
import type { GitDiscoveryWarnings } from "../../sources/discovery.ts";
import { sourceRelativePath } from "../../sources/path.ts";
import { indexTap, type TapIndex, tapRoot } from "../tap-index.ts";
import type { RejectedReferenceSkill } from "./diagnostics.ts";
import type { NonTapNameCandidate, TapRoots } from "./types.ts";

/** Reference-only namespace context, derived from the same indexed root (§8.3, §9). */
export interface ReferenceTapIndex extends TapIndex {
  readonly skipped: readonly RejectedReferenceSkill[];
}

/** Index `tap`, reading from its exported root when one was supplied. */
export function indexTapAt(
  tap: TapConfig,
  home: string,
  roots: TapRoots,
  discovery?: GitDiscoveryWarnings,
): ReferenceTapIndex {
  const root = roots[tap.name] ?? tapRoot(tap, home);
  const index = indexTap(tap, home, root, discovery);
  const skipped = index.skipped.map((skill): RejectedReferenceSkill => {
    const parts = sourceRelativePath(root, skill.path).split("/");
    const namespace = parts.length === 3 && parts[0] === "skills" ? parts[1]! : null;
    return { ...skill, tap: tap.name, namespace };
  });
  return { ...index, skipped };
}

/**
 * Index `tap`, or null when it can't be read. A tap that fails to
 * materialize must not abort resolution across the other taps — the
 * caller is searching for a name and an unreadable tap simply cannot
 * contribute a candidate.
 */
export function safeIndex(
  tap: TapConfig,
  home: string,
  roots: TapRoots,
  discovery?: GitDiscoveryWarnings,
): ReferenceTapIndex | null {
  try {
    return indexTapAt(tap, home, roots, discovery);
  } catch {
    return null;
  }
}

/** The skill named `name` inside `tap`, preferring an unnamespaced match. */
export function lookupInIndex(
  tap: TapConfig,
  index: TapIndex,
  name: string,
): NonTapNameCandidate | null {
  const locs = index.skills.get(name);
  if (!locs || locs.length === 0) return null;
  // Prefer unnamespaced. If the same name lives in multiple
  // namespaces, a 2-segment ref is ambiguous within the tap; we pick
  // deterministically and rely on 3-segment for true disambiguation.
  const unnamespaced = locs.find((l) => l.namespace === null);
  return { kind: "skill", tap, location: unnamespaced ?? locs[0]! };
}
