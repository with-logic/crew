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
 * prompt or error on ambiguity. The legacy entry point
 * `findTapForBareName` is preserved for unchanged call sites —
 * it returns the single tap that holds the bare skill name and
 * throws `invalid_ref` when zero or `ambiguous_reference` when many.
 */

import { CrewError } from "../core/errors.ts";
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

/**
 * Legacy: find exactly the single tap holding a bare skill name.
 * Used by call sites that haven't migrated to the richer candidate
 * enumeration. Throws `invalid_ref` on zero, `ambiguous_reference`
 * on many.
 */
export function findTapForBareName(name: string, config: Config, home: string): TapConfig {
  const candidates = enumerateCandidates(name, config, home).filter((c) => c.kind === "skill");
  if (candidates.length === 0) {
    const tapNames = config.taps.map((t) => t.name).join(", ");
    throw new CrewError(
      "invalid_ref",
      `skill \`${name}\` isn't in any configured tap (searched: ${tapNames || "<none>"}) — try \`crew search ${name}\`, or add a tap with \`crew tap add <url>\``,
      { skill: name },
    );
  }
  // Dedupe by tap — the "skill in multiple namespaces within one tap"
  // case is handled by the richer resolver, not this legacy path.
  const taps = new Map<string, TapConfig>();
  for (const c of candidates) {
    if (c.kind !== "skill") continue;
    taps.set(c.tap.name, c.tap);
  }
  if (taps.size > 1) {
    const qualifieds = [...taps.values()].map((t) => `${t.name}/${name}`).join(", ");
    throw new CrewError(
      "ambiguous_reference",
      `skill \`${name}\` matches multiple taps (${qualifieds}) — qualify with one of those names to pick`,
      { candidates: qualifieds },
    );
  }
  return [...taps.values()][0]!;
}
