/**
 * Resolution for qualified tap references — `<tap>/<skill>` and
 * `<tap>/<namespace>/<skill>` (§8.3).
 *
 * A three-segment reference names exactly one tap, namespace, and
 * skill, so it either matches or is `invalid_ref`. A two-segment
 * reference is genuinely ambiguous: the first segment can be a tap
 * name or a namespace in some other tap, and §8.3 resolves that
 * tap-first, leaving the three-segment form as the way to force the
 * namespaced reading.
 *
 * Bare-name resolution lives in `./index.ts`; these two share the tap
 * index helpers in `./tap-index-lookup.ts`.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, TapSource } from "../../core/types.ts";
import { ambiguityError } from "./errors.ts";
import { indexTapAt, lookupInTap, safeIndex } from "./tap-index-lookup.ts";
import type { NonTapNameCandidate, TapRoots } from "./types.ts";

/** `<tap>/<namespace>/<skill>` — unambiguous, so it matches or throws. */
export function resolveThreeSegment(
  source: TapSource,
  config: Config,
  home: string,
  roots: TapRoots,
): NonTapNameCandidate {
  const tap = config.taps.find((t) => t.name === source.tap);
  if (!tap) {
    throw new CrewError(
      "invalid_ref",
      `\`${source.tap}\` was not found in your list of taps.`,
      { tap: source.tap },
      "View your configured taps with `crew tap list`.",
    );
  }
  const index = indexTapAt(tap, home, roots);
  const locs = index.skills.get(source.name) ?? [];
  const match = locs.find((l) => l.namespace === source.namespace);
  if (!match) {
    throw new CrewError(
      "invalid_ref",
      `\`${source.tap}/${source.namespace}/${source.name}\` doesn't exist — no skill \`${source.name}\` found in namespace \`${source.namespace}\` of tap \`${source.tap}\``,
      { tap: source.tap, namespace: source.namespace, name: source.name },
    );
  }
  return { kind: "skill", tap, location: match };
}

/** `<tap>/<skill>` or `<namespace>/<skill>` — tap-first per §8.3. */
export function resolveTwoSegment(
  source: TapSource,
  config: Config,
  home: string,
  roots: TapRoots,
): NonTapNameCandidate {
  const first = source.tap!;
  const second = source.name;
  const tap = config.taps.find((t) => t.name === first);
  const asTapSkill = tap ? lookupInTap(tap, home, second, roots) : null;

  // Collect namespace candidates: `<first>` is a namespace in some tap
  // that holds a skill named `<second>`.
  const nsCandidates: NonTapNameCandidate[] = [];
  for (const t of config.taps) {
    if (t === tap) continue;
    const idx = safeIndex(t, home, roots);
    if (!idx) continue;
    const nsMembers = idx.namespaces.get(first);
    if (!nsMembers) continue;
    const loc = nsMembers.find((m) => m.name === second);
    if (loc) nsCandidates.push({ kind: "skill", tap: t, location: loc });
  }

  if (asTapSkill && nsCandidates.length === 0) return asTapSkill;
  if (!asTapSkill && nsCandidates.length === 1) return nsCandidates[0]!;
  if (asTapSkill && nsCandidates.length >= 1) {
    // Tap-first wins when both interpretations exist. The user can
    // force the namespaced form with a 3-segment ref.
    return asTapSkill;
  }
  if (nsCandidates.length > 1) {
    throw ambiguityError(
      second,
      nsCandidates,
      `\`${first}/${second}\` is a namespaced skill in multiple taps`,
    );
  }
  throw new CrewError(
    "invalid_ref",
    `\`${first}/${second}\` does not match any configured tap or namespace.\nNo tap or namespace named \`${first}\` has a skill named \`${second}\`.`,
    { first, second },
    `Run \`crew search ${second}\` to look for matching skills, or \`crew tap list\` to see your taps.`,
  );
}
