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
 */

import { CrewError } from "../../core/errors.ts";
import type { Config, TapConfig, TapSource } from "../../core/types.ts";
import type { NameCandidate } from "../attribute-bare-name.ts";
import { enumerateCandidates } from "../attribute-bare-name.ts";
import { indexTap, type TapIndex } from "../tap-index.ts";
import { formatCandidate } from "./format.ts";

export { formatCandidate, shortLabelFor } from "./format.ts";

/** Force-one-kind hint from a `--tap` / `--bundle` / `--skill` flag. */
export type KindHint = "tap" | "namespace" | "skill" | null;

/**
 * Resolve a `TapSource` to the single candidate it refers to. See the
 * disambiguation rules in PRD §8.3.
 */
export function resolveTapRef(
  source: TapSource,
  config: Config,
  home: string,
  kindHint: KindHint = null,
): NameCandidate {
  // 3-segment: <tap>/<namespace>/<skill> — always unambiguous.
  if (source.tap !== null && source.namespace !== null) {
    return resolveThreeSegment(source, config, home);
  }

  // 2-segment: <first>/<second>. Try tap-first, then namespace-first.
  if (source.tap !== null && source.namespace === null) {
    return resolveTwoSegment(source, config, home);
  }

  // Bare name.
  return resolveBare(source.name, config, home, kindHint);
}

function resolveThreeSegment(source: TapSource, config: Config, home: string): NameCandidate {
  const tap = config.taps.find((t) => t.name === source.tap);
  if (!tap) {
    throw new CrewError(
      "invalid_ref",
      `no tap named \`${source.tap}\` is configured — run \`crew tap list\` to see configured taps`,
      { tap: source.tap },
    );
  }
  const index = indexTap(tap, home);
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

function resolveTwoSegment(source: TapSource, config: Config, home: string): NameCandidate {
  const first = source.tap!;
  const second = source.name;
  const tap = config.taps.find((t) => t.name === first);
  const asTapSkill = tap ? lookupInTap(tap, home, second) : null;

  // Collect namespace candidates: `<first>` is a namespace in some tap
  // that holds a skill named `<second>`.
  const nsCandidates: NameCandidate[] = [];
  for (const t of config.taps) {
    if (t === tap) continue;
    const idx = safeIndex(t, home);
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
    `\`${first}/${second}\` doesn't resolve — no tap or namespace named \`${first}\` holds a skill \`${second}\``,
    { first, second },
  );
}

function resolveBare(
  name: string,
  config: Config,
  home: string,
  kindHint: KindHint,
): NameCandidate {
  const all = enumerateCandidates(name, config, home);

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
      `\`${name}\` isn't a tap, skill, or namespace in any configured tap (searched: ${tapNames || "<none>"})`,
      { name },
    );
  }
  if (all.length === 1) return all[0]!;
  throw ambiguityError(name, all);
}

function lookupInTap(tap: TapConfig, home: string, name: string): NameCandidate | null {
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

function safeIndex(tap: TapConfig, home: string): TapIndex | null {
  try {
    return indexTap(tap, home);
  } catch {
    return null;
  }
}

function flagFor(k: Exclude<KindHint, null>): string {
  if (k === "tap") return "tap";
  if (k === "namespace") return "bundle";
  return "skill";
}

function ambiguityError(
  name: string,
  candidates: readonly NameCandidate[],
  reason?: string,
): CrewError {
  const lines: string[] = [];
  lines.push(reason ?? `\`${name}\` is ambiguous across taps, skills, and namespaces`);
  lines.push("");
  lines.push("  Rerun with one of:");
  lines.push("");
  for (const c of candidates) {
    lines.push(`    ${formatCandidate(c, name)}`);
  }
  lines.push("");
  const detail = candidates.map((c) => formatCandidate(c, name));
  return new CrewError("ambiguous_reference", lines.join("\n"), {
    name,
    candidates: detail,
  });
}
