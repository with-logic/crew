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
 * This module scans every interpretation and lets the caller
 * prompt or error on ambiguity (§8.3), retaining final-miss diagnostics.
 */

import type { Config, TapConfig } from "../core/types.ts";
import type { RejectedReferenceSkill } from "./resolve-ref/diagnostics.ts";
import { indexTapAt, type ReferenceTapIndex } from "./resolve-ref/tap-index-lookup.ts";
import type { SkillLocation } from "./tap-index.ts";

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

/**
 * Walk every configured tap and collect candidates for `name`.
 *
 * `roots` supplies already-materialized directories per tap name, so a
 * ref-carrying reference resolves against the requested commit instead
 * of the shared clone's checked-out revision (§9 step 3).
 */
export function scanNameCandidates(
  name: string,
  config: Config,
  home: string,
  roots: Readonly<Record<string, string | undefined>> = {},
): {
  readonly candidates: readonly NameCandidate[];
  readonly rejected: readonly RejectedReferenceSkill[];
} {
  const out: NameCandidate[] = [];
  const rejected: RejectedReferenceSkill[] = [];
  for (const tap of config.taps) {
    if (tap.name === name) {
      out.push({ kind: "tap", tap });
    }
    let index: ReferenceTapIndex;
    try {
      index = indexTapAt(tap, home, roots);
    } catch {
      // Soft-fail unreachable taps; same policy as search.
      continue;
    }
    for (const skill of index.skipped) rejected.push({ ...skill, tap: tap.name });
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
  return { candidates: out, rejected };
}
