/**
 * Bare-name resolution for `crew install <name>`.
 *
 * A bare name can be:
 *   - a tap (install the whole tap),
 *   - a skill in one or more taps,
 *   - a namespace in one or more taps (install every skill in the
 *     namespace),
 *   - none of the above (invalid).
 *
 * This module enumerates every interpretation and lets the caller
 * prompt or error on ambiguity.
 */

import type { Config, TapConfig } from "../core/types.ts";
import type { SkillLocation, TapIndex } from "./tap-index.ts";
import { indexTap } from "./tap-index.ts";

/** One concrete interpretation of a bare name. */
export type NameCandidate =
  | { readonly kind: "tap"; readonly tap: TapConfig }
  | {
      readonly kind: "skill";
      readonly tap: TapConfig;
      readonly location: SkillLocation;
    }
  | {
      readonly kind: "namespace";
      readonly tap: TapConfig;
      readonly namespace: string;
      readonly members: readonly SkillLocation[];
    };

/** Walk every configured tap and collect candidates for `name`. */
export function enumerateCandidates(
  name: string,
  config: Config,
  home: string,
): readonly NameCandidate[] {
  const out: NameCandidate[] = [];
  for (const tap of config.taps) {
    if (tap.name === name) {
      out.push({ kind: "tap", tap });
    }
    let index: TapIndex;
    try {
      index = indexTap(tap, home);
    } catch {
      // Soft-fail unreachable taps; same policy as search.
      continue;
    }
    const skillLocs = index.skills.get(name);
    if (skillLocs) {
      for (const loc of skillLocs) {
        out.push({ kind: "skill", tap, location: loc });
      }
    }
    const nsMembers = index.namespaces.get(name);
    if (nsMembers) {
      out.push({ kind: "namespace", tap, namespace: name, members: nsMembers });
    }
  }
  return out;
}
