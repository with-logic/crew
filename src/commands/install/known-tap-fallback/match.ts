/**
 * Exact known-tap install suggestion matching (§9 / §16.2.1).
 */

import type { TapSource } from "../../../core/types.ts";
import { sameNullableText, sameText } from "../../../known-taps/text.ts";
import type { KnownTap, KnownTapSkill } from "../../../known-taps/types.ts";

export interface KnownInstallSuggestion {
  readonly tap: KnownTap;
  readonly skill: KnownTapSkill | null;
  readonly installRef: string;
}

export function knownMatchesForTap(tap: KnownTap, source: TapSource): KnownInstallSuggestion[] {
  if (source.tap === null) {
    return bareMatches(tap, source);
  }
  if (source.namespace === null) {
    return twoSegmentMatches(tap, source.tap, source.name, source.ref);
  }
  return threeSegmentMatches(tap, source.tap, source.namespace, source.name, source.ref);
}

function bareMatches(tap: KnownTap, source: TapSource): KnownInstallSuggestion[] {
  const skillMatches: KnownInstallSuggestion[] = [];
  for (const skill of tap.skills) {
    if (sameText(skill.name, source.name)) {
      skillMatches.push(skillSuggestion(tap, skill, source.ref));
    }
  }
  if (skillMatches.length > 0) {
    return skillMatches;
  }
  if (sameText(tap.name, source.name)) {
    return [{ tap, skill: null, installRef: tap.name }];
  }
  return [];
}

function twoSegmentMatches(
  tap: KnownTap,
  sourceTap: string,
  name: string,
  ref: string | null,
): KnownInstallSuggestion[] {
  const out: KnownInstallSuggestion[] = [];
  for (const skill of tap.skills) {
    if (
      matchesTapSkill(tap, skill, sourceTap, name) ||
      matchesNamespaceSkill(skill, sourceTap, name)
    ) {
      out.push(skillSuggestion(tap, skill, ref));
    }
  }
  return out;
}

function threeSegmentMatches(
  tap: KnownTap,
  sourceTap: string,
  namespace: string,
  name: string,
  ref: string | null,
): KnownInstallSuggestion[] {
  const out: KnownInstallSuggestion[] = [];
  for (const skill of tap.skills) {
    if (matchesTapNamespaceSkill(tap, skill, sourceTap, namespace, name)) {
      out.push(skillSuggestion(tap, skill, ref));
    }
  }
  return out;
}

function skillSuggestion(
  tap: KnownTap,
  skill: KnownTapSkill,
  ref: string | null,
): KnownInstallSuggestion {
  const label = skill.namespace === null ? skill.name : `${skill.namespace}/${skill.name}`;
  return { tap, skill, installRef: `${tap.name}/${label}${ref === null ? "" : `@${ref}`}` };
}

function matchesTapSkill(
  tap: KnownTap,
  skill: KnownTapSkill,
  sourceTap: string,
  name: string,
): boolean {
  return sameText(tap.name, sourceTap) && sameText(skill.name, name);
}

function matchesNamespaceSkill(skill: KnownTapSkill, sourceTap: string, name: string): boolean {
  return sameNullableText(skill.namespace, sourceTap) && sameText(skill.name, name);
}

function matchesTapNamespaceSkill(
  tap: KnownTap,
  skill: KnownTapSkill,
  sourceTap: string,
  namespace: string,
  name: string,
): boolean {
  return (
    sameText(tap.name, sourceTap) &&
    sameNullableText(skill.namespace, namespace) &&
    sameText(skill.name, name)
  );
}
