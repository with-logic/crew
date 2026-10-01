/**
 * Source classification for duplicate installs (§5.4, §16.5).
 *
 * Decides what an install of an already-installed name may do to the
 * existing entry's attribution: conflict outright, move it onto the
 * incoming tap, or leave it alone. Split from the partitioning loop in
 * `./index.ts` because these are the spec's identity rules, not the
 * bucketing mechanics.
 */

import { CrewError } from "../../core/errors.ts";
import type { ResolvedSkill, StateEntry, TapConfig } from "../../core/types.ts";
import { identityOfStateSource, sameSourceIdentity, sourceIdentityOf } from "../source-identity.ts";
import { isTapRootNarrowerThan } from "../tap-breadth.ts";
import type { Reattribution } from "./types.ts";

/**
 * True when installing `skill` over `existing` would trade a whole-tap
 * subscription for a tap rooted deeper in the same repo. Mirrors the
 * guard in `classifySource`; kept separate because that function returns
 * null for several unrelated reasons.
 */
export function narrowsSubscription(
  existing: StateEntry,
  skill: ResolvedSkill,
  taps: readonly TapConfig[],
): boolean {
  if (existing.tracks_tap !== true) return false;
  if (existing.source.tap === skill.tap.name) return false;
  const existingTap = taps.find((t) => t.name === existing.source.tap);
  if (!existingTap) return false;
  return isTapRootNarrowerThan(skill.tap, existingTap);
}

/**
 * Decide whether `skill` may land on top of `existing`. Throws
 * `name_conflict` when the two name genuinely different sources.
 * Returns a `Reattribution` when the entry should move to the incoming
 * tap covering the same location, or null when attribution already
 * matches, the existing tap is the user's own, or the move would narrow
 * a whole-tap subscription.
 */
export function classifySource(
  existing: StateEntry,
  skill: ResolvedSkill,
  taps: readonly TapConfig[],
  projectRoot: string | null,
): Reattribution | null {
  if (existing.source.tap === skill.tap.name && existing.source.path === skill.tapRelativePath) {
    return null;
  }
  const existingIdentity = identityOfStateSource(existing.source, taps);
  const incomingIdentity = sourceIdentityOf(skill.tap, skill.tapRelativePath);
  if (existingIdentity === null || !sameSourceIdentity(existingIdentity, incomingIdentity)) {
    throw new CrewError(
      "name_conflict",
      `a skill named \`${skill.name}\` is already installed from a different source — run \`crew uninstall ${skill.name}\` first, then install from the new source`,
      {
        existing: existing.source,
        incoming: { tap: skill.tap.name, path: skill.tapRelativePath },
      },
    );
  }
  // Same bytes, same place, different tap row. A registered tap is the
  // user's own naming choice — leave it alone. An auto tap is crew's
  // bookkeeping, so move the entry onto the tap covering the location.
  const existingTap = taps.find((t) => t.name === existing.source.tap);
  if (existingTap?.registered !== false) return null;
  // Never trade a whole-tap subscription for a narrower one. The old tap
  // is garbage-collected once its last entry leaves, so moving a
  // `tracks_tap` entry onto a tap rooted deeper in the same repo would
  // silently end sibling re-expansion (§10.1.1). Every direct git/path
  // install sets `tracksTap`, so the test is which tap sees more: the
  // incoming root must not be a strict descendant of the existing one.
  if (existing.tracks_tap === true && isTapRootNarrowerThan(skill.tap, existingTap)) return null;
  return {
    name: existing.name,
    scope: existing.scope,
    projectRoot,
    fromTap: existing.source.tap,
    toTap: skill.tap.name,
    toPath: skill.tapRelativePath,
    tracksTap: skill.tracksTap,
  };
}
