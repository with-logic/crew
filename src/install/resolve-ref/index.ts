/**
 * Resolve a parsed `TapSource` into a concrete `NameCandidate` that
 * the install flow can act on (§8.3).
 *
 * Inputs:
 *   - the structured ref from `parseRef`
 *   - the current config (to know the tap set)
 *   - the CREW_HOME (to materialize each tap's on-disk layout)
 *
 * Output: exactly one `NameCandidate`. Throws `invalid_ref` if
 * nothing matches, or `ambiguous_reference` if more than one
 * interpretation is possible (and no force flag resolved the tie).
 *
 * Callers in an interactive path should inspect the error's
 * `candidates` detail and present a prompt; the CLI install command
 * does that before calling this module.
 *
 * This file owns dispatch and bare-name resolution. Qualified forms
 * live in `./qualified.ts` and the shared index access in
 * `./tap-index-lookup.ts`.
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, TapSource } from "../../core/types.ts";
import type { NameCandidate } from "../attribute-bare-name.ts";
import { enumerateCandidates } from "../attribute-bare-name.ts";
import { ambiguityError, flagFor } from "./errors.ts";
import { resolveThreeSegment, resolveTwoSegment } from "./qualified.ts";
import type { KindHint, NonTapNameCandidate, TapRoots } from "./types.ts";

export type { KindHint, NonTapNameCandidate, SpecificKindHint, TapRoots } from "./types.ts";

/**
 * Resolve a `TapSource` to the single candidate it refers to. See the
 * disambiguation rules in PRD §8.3.
 */
export function resolveTapRef(
  source: TapSource,
  config: Config,
  home: string,
  kindHint: "non-tap",
  roots?: TapRoots,
): NonTapNameCandidate;
export function resolveTapRef(
  source: TapSource,
  config: Config,
  home: string,
  kindHint?: KindHint,
  roots?: TapRoots,
): NameCandidate;
export function resolveTapRef(
  source: TapSource,
  config: Config,
  home: string,
  kindHint: KindHint = null,
  roots: TapRoots = {},
): NameCandidate {
  // 3-segment: <tap>/<namespace>/<skill> — always unambiguous.
  if (source.tap !== null && source.namespace !== null) {
    return resolveThreeSegment(source, config, home, roots);
  }

  // 2-segment: <first>/<second>. Try tap-first, then namespace-first.
  if (source.tap !== null && source.namespace === null) {
    return resolveTwoSegment(source, config, home, roots);
  }

  // Bare name.
  return resolveBare(source.name, config, home, kindHint, roots);
}

function resolveBare(
  name: string,
  config: Config,
  home: string,
  kindHint: KindHint,
  roots: TapRoots,
): NameCandidate {
  const all = enumerateCandidates(name, config, home, roots);

  if (kindHint === "non-tap") {
    const filtered = all.filter((c): c is NonTapNameCandidate => c.kind !== "tap");
    if (filtered.length === 0) {
      const tapNames = config.taps.map((t) => t.name).join(", ");
      throw new CrewError(
        "invalid_ref",
        `\`${name}\` isn't a skill or namespace in any configured tap (searched: ${tapNames || "<none>"})`,
        { name },
      );
    }
    if (filtered.length === 1) return filtered[0]!;
    throw ambiguityError(name, filtered);
  }

  if (kindHint !== null) {
    const filtered = all.filter((c) => c.kind === kindHint);
    if (filtered.length === 0) {
      throw new CrewError(
        "invalid_ref",
        `\`${name}\` is not a ${kindHint}; rerun without \`--${flagFor(kindHint)}\` or pick a different value`,
        { name, kind: kindHint },
      );
    }
    if (filtered.length === 1) return filtered[0]!;
    throw ambiguityError(name, filtered);
  }

  if (all.length === 0) {
    const tapNames = config.taps.map((t) => t.name).join(", ");
    throw new CrewError(
      "invalid_ref",
      `\`${name}\` was not found in any configured tap.`,
      { name },
      `Searched: ${tapNames || "<none>"}.`,
    );
  }
  if (all.length === 1) return all[0]!;
  throw ambiguityError(name, all);
}
