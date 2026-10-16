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

/** True when `existing` is already attributed to the tap and path `skill` comes through. */
export function hasSameAttribution(existing: StateEntry, skill: ResolvedSkill): boolean {
  return existing.source.tap === skill.tap.name && existing.source.path === skill.tapRelativePath;
}

/**
 * Decide whether `skill` may land on top of `existing`. Throws
 * `name_conflict` when the two name genuinely different sources.
 * Returns a `Reattribution` when the entry should move to the incoming
 * tap covering the same location, or null when attribution already
 * matches, the existing tap is the user's own, or the move would narrow
 * a whole-tap subscription or carry it where the user never subscribed.
 * `reinstalls`: the install rewrites the entry, so it ends at `skill.ref`.
 */
export function classifySource(
  existing: StateEntry,
  skill: ResolvedSkill,
  taps: readonly TapConfig[],
  projectRoot: string | null,
  reinstalls: boolean,
): Reattribution | null {
  if (hasSameAttribution(existing, skill)) return null;
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
  // §5.4, §11.1: a tracking entry moves only with its subscription, and
  // that only to a tap this install subscribes to at the ref the entry
  // ends at — its own when already installed (a move keeps it), the
  // install's when reinstalled. Moved without it, the entry would stop
  // following its own tap; with it anywhere else, it would follow
  // siblings the user never subscribed to.
  const subscribesHere = skill.tracksTap && (reinstalls || existing.ref === skill.ref);
  if (existing.tracks_tap === true && !subscribesHere) return null;
  return {
    name: existing.name,
    scope: existing.scope,
    projectRoot,
    fromTap: existing.source.tap,
    toTap: skill.tap.name,
    toPath: skill.tapRelativePath,
    tracksTap: subscribesHere,
  };
}
